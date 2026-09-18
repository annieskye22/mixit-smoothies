use super::*;
use near_sdk::{test_utils::{VMContextBuilder, get_logs}, testing_env};

fn account(name: &str) -> AccountId { name.parse().unwrap() }
fn context(name: &str) {
    let mut c = VMContextBuilder::new();
    c.current_account_id(account("mixit.testnet")).predecessor_account_id(account(name))
        .signer_account_id(account(name)).attached_deposit(NearToken::from_near(1))
        .block_timestamp(1_700_000_000_000_000_000);
    testing_env!(c.build());
}
fn setup() -> Mixit {
    context("admin.testnet");
    let mut c = Mixit::new(account("admin.testnet"));
    c.set_role(account("farm.testnet"), Role::Producer);
    c.set_role(account("ship.testnet"), Role::Distributor);
    c.set_role(account("shop.testnet"), Role::Retailer);
    c
}
fn register(c: &mut Mixit) -> String {
    context("farm.testnet");
    c.register_batch("lot-1".into(), "Mango Sunrise".into(), None, None).batch_id
}

#[test]
fn complete_trail_and_pagination() {
    let mut c = setup();
    let id = register(&mut c);
    assert!(get_logs()[0].starts_with("EVENT_JSON:"));
    c.transfer_custody(id.clone(), account("ship.testnet"));
    context("ship.testnet");
    c.transfer_custody(id.clone(), account("shop.testnet"));
    assert_eq!(c.get_batch(id.clone()).unwrap().status, Status::AtRetailer);
    let events = c.get_history(id.clone(), Some(1), Some(1));
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].actor, account("farm.testnet"));
    assert_eq!(c.get_history(id.clone(), None, None).len(), 3);
    assert!(c.get_history(id, Some(99), None).is_empty());
}
#[test]
#[should_panic(expected = "Only owner")]
fn cannot_self_assign_role() {
    let mut c = setup(); context("evil.testnet");
    c.set_role(account("evil.testnet"), Role::Producer);
}
#[test]
#[should_panic(expected = "Producer role required")]
fn consumer_cannot_register() { let mut c = setup(); context("guest.testnet"); c.register_batch("x".into(), "Juice".into(), None, None); }
#[test]
#[should_panic(expected = "Batch already exists")]
fn duplicate_id_rejected() { let mut c = setup(); register(&mut c); register(&mut c); }
#[test]
#[should_panic(expected = "Only current custodian")]
fn non_holder_cannot_transfer() { let mut c = setup(); let id = register(&mut c); context("ship.testnet"); c.transfer_custody(id, account("shop.testnet")); }
#[test]
#[should_panic(expected = "Recipient has wrong role")]
fn cannot_skip_distributor() { let mut c = setup(); let id = register(&mut c); c.transfer_custody(id, account("shop.testnet")); }
#[test]
#[should_panic(expected = "Insufficient storage deposit")]
fn storage_must_be_paid() {
    let mut c = setup();
    let mut ctx = VMContextBuilder::new();
    ctx.predecessor_account_id(account("farm.testnet")).attached_deposit(NearToken::from_yoctonear(0));
    testing_env!(ctx.build());
    c.register_batch("unpaid".into(), "Juice".into(), None, None);
}
#[test]
fn unknown_accounts_are_consumers() { let c = setup(); assert_eq!(c.get_role(account("guest.testnet")), Role::Consumer); }

#[test]
#[should_panic(expected = "Retail custody is terminal")]
fn retail_custody_is_terminal() {
    let mut c = setup(); let id = register(&mut c);
    c.transfer_custody(id.clone(), account("ship.testnet"));
    context("ship.testnet"); c.transfer_custody(id.clone(), account("shop.testnet"));
    context("shop.testnet"); c.transfer_custody(id, account("farm.testnet"));
}
#[test]
#[should_panic(expected = "Custodian role revoked or changed")]
fn revoked_custodian_cannot_transfer() {
    let mut c = setup(); let id = register(&mut c);
    context("admin.testnet"); c.set_role(account("farm.testnet"), Role::Consumer);
    context("farm.testnet"); c.transfer_custody(id, account("ship.testnet"));
}
#[test]
#[should_panic(expected = "Metadata URI and SHA256")]
fn metadata_requires_hash() {
    let mut c = setup(); context("farm.testnet");
    c.register_batch("metadata".into(), "Juice".into(), Some("https://example.com/lot.json".into()), None);
}
#[test]
#[should_panic(expected = "Limit must be 1..100")]
fn history_reads_are_bounded() {
    let mut c = setup(); let id = register(&mut c); c.get_history(id, None, Some(101));
}
#[test]
fn emitted_event_contains_actor_and_status() {
    let mut c = setup(); let id = register(&mut c);
    c.transfer_custody(id, account("ship.testnet"));
    let logs = get_logs();
    let last = logs.last().unwrap().strip_prefix("EVENT_JSON:").unwrap();
    let event: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(last).unwrap();
    assert_eq!(event["event"], "custody_transferred");
    assert_eq!(event["data"][0]["actor"], "farm.testnet");
    assert_eq!(event["data"][0]["status"], "InDistribution");
    assert!(event["data"][0]["timestamp_ns"].is_string());
}
