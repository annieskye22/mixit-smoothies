use near_sdk::{collections::LookupMap, env, json_types::U64, near, require, AccountId, NearToken, PanicOnDefault, Promise};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Role { Producer, Distributor, Retailer, Consumer }

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status { Registered, InDistribution, AtRetailer }

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Batch {
    pub batch_id: String,
    pub product_name: String,
    pub producer: AccountId,
    pub custodian: AccountId,
    pub custodian_role: Role,
    pub status: Status,
    pub metadata_uri: Option<String>,
    pub metadata_sha256: Option<String>,
    pub created_at_ns: U64,
    pub history_count: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct CustodyEvent {
    pub index: u32,
    pub batch_id: String,
    pub actor: AccountId,
    pub from: Option<AccountId>,
    pub to: AccountId,
    pub to_role: Role,
    pub timestamp_ns: U64,
    pub status: Status,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Mixit {
    owner_id: AccountId,
    roles: LookupMap<AccountId, Role>,
    batches: LookupMap<String, Batch>,
    history: LookupMap<(String, u32), CustodyEvent>,
}

#[near]
impl Mixit {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self { owner_id, roles: LookupMap::new(b"r"), batches: LookupMap::new(b"b"), history: LookupMap::new(b"h") }
    }

    pub fn get_owner(&self) -> AccountId { self.owner_id.clone() }

    /// Consumer is the public, unprivileged default. No registration is needed to verify.
    pub fn get_role(&self, account_id: AccountId) -> Role {
        self.roles.get(&account_id).unwrap_or(Role::Consumer)
    }

    /// Only the administrator can onboard or revoke a participant (Consumer revokes).
    #[payable]
    pub fn set_role(&mut self, account_id: AccountId, role: Role) {
        require!(env::predecessor_account_id() == self.owner_id, "Only owner can assign roles");
        let before = env::storage_usage();
        self.roles.insert(&account_id, &role);
        self.settle_storage(before);
        Self::emit("role_assigned", near_sdk::serde_json::json!({
            "actor": env::predecessor_account_id(), "account_id": account_id,
            "role": role, "timestamp_ns": env::block_timestamp().to_string()
        }));
    }

    /// A local UUID is namespaced under the actual predecessor, preventing ID squatting.
    #[payable]
    pub fn register_batch(&mut self, local_id: String, product_name: String,
        metadata_uri: Option<String>, metadata_sha256: Option<String>) -> Batch {
        let actor = env::predecessor_account_id();
        require!(self.get_role(actor.clone()) == Role::Producer, "Producer role required");
        require!(!local_id.is_empty() && local_id.len() <= 64 && local_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'), "Invalid local ID");
        require!(!product_name.trim().is_empty() && product_name.len() <= 120, "Invalid product name");
        require!(metadata_uri.is_some() == metadata_sha256.is_some(), "Metadata URI and SHA256 must be supplied together");
        if let Some(uri) = &metadata_uri {
            require!(uri.len() <= 512 && (uri.starts_with("https://") || uri.starts_with("ipfs://")), "Invalid metadata URI");
        }
        if let Some(hash) = &metadata_sha256 {
            require!(hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()), "Invalid SHA256");
        }
        let batch_id = format!("{}:{}", actor, local_id);
        require!(self.batches.get(&batch_id).is_none(), "Batch already exists");
        let before = env::storage_usage();
        let batch = Batch { batch_id: batch_id.clone(), product_name, producer: actor.clone(),
            custodian: actor.clone(), custodian_role: Role::Producer, status: Status::Registered,
            metadata_uri, metadata_sha256, created_at_ns: U64(env::block_timestamp()), history_count: 1 };
        let event = CustodyEvent { index: 0, batch_id: batch_id.clone(), actor: actor.clone(), from: None,
            to: actor, to_role: Role::Producer, timestamp_ns: batch.created_at_ns, status: Status::Registered };
        self.history.insert(&(batch_id.clone(), 0), &event);
        self.batches.insert(&batch_id, &batch);
        self.settle_storage(before);
        Self::emit("batch_registered", near_sdk::serde_json::to_value(&event).unwrap());
        batch
    }

    #[payable]
    pub fn transfer_custody(&mut self, batch_id: String, receiver_id: AccountId) -> Batch {
        let mut batch = self.batches.get(&batch_id).expect("Batch not found");
        let actor = env::predecessor_account_id();
        require!(actor == batch.custodian, "Only current custodian can transfer");
        require!(self.get_role(actor.clone()) == batch.custodian_role, "Custodian role revoked or changed");
        require!(actor != receiver_id, "Cannot transfer to self");
        let (next_role, status) = match batch.custodian_role {
            Role::Producer => (Role::Distributor, Status::InDistribution),
            Role::Distributor => (Role::Retailer, Status::AtRetailer),
            _ => env::panic_str("Retail custody is terminal"),
        };
        require!(self.get_role(receiver_id.clone()) == next_role, "Recipient has wrong role");
        let before = env::storage_usage();
        let event = CustodyEvent { index: batch.history_count, batch_id: batch_id.clone(),
            actor: actor.clone(), from: Some(actor), to: receiver_id.clone(), to_role: next_role.clone(),
            timestamp_ns: U64(env::block_timestamp()), status: status.clone() };
        self.history.insert(&(batch_id.clone(), batch.history_count), &event);
        batch.history_count += 1;
        batch.custodian = receiver_id;
        batch.custodian_role = next_role;
        batch.status = status;
        self.batches.insert(&batch_id, &batch);
        self.settle_storage(before);
        Self::emit("custody_transferred", near_sdk::serde_json::to_value(&event).unwrap());
        batch
    }

    pub fn get_batch(&self, batch_id: String) -> Option<Batch> { self.batches.get(&batch_id) }

    /// O(limit) reads; timestamps are decimal strings to avoid JavaScript precision loss.
    pub fn get_history(&self, batch_id: String, from_index: Option<u32>, limit: Option<u32>) -> Vec<CustodyEvent> {
        let batch = self.batches.get(&batch_id).expect("Batch not found");
        let start = from_index.unwrap_or(0);
        let size = limit.unwrap_or(20);
        require!(size > 0 && size <= 100, "Limit must be 1..100");
        (start..start.saturating_add(size).min(batch.history_count))
            .map(|i| self.history.get(&(batch_id.clone(), i)).expect("Missing history entry")).collect()
    }
}

impl Mixit {
    // Legacy LookupMap writes immediately, making storage_usage accounting exact here.
    fn settle_storage(&self, before: u64) {
        let bytes = env::storage_usage().saturating_sub(before);
        let cost = u128::from(bytes) * env::storage_byte_cost().as_yoctonear();
        let paid = env::attached_deposit().as_yoctonear();
        require!(paid >= cost, "Insufficient storage deposit");
        if paid > cost {
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(paid - cost));
        }
    }

    fn emit(event: &str, data: near_sdk::serde_json::Value) {
        env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({
            "standard": "mixit_trace", "version": "1.0.0", "event": event, "data": [data]
        })));
    }
}

#[cfg(test)]
mod tests;
