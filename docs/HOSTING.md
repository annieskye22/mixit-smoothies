# Public portfolio hosting

The repository includes a Render Blueprint (`render.yaml`) for one free Node web service. It builds the existing React application and Express API, then serves both on the same HTTPS origin. The API reads the deployed contract `lil-akirabear.testnet` through FASTNEAR. No wallet keys or database are needed on the host.

[Deploy to Render](https://render.com/deploy?repo=https://github.com/annieskye22/mixit-smoothies)

Sign in with your own Render account, review the Blueprint (one **free** service), and deploy. Keep the repository root as the build root. The configuration supplies the build/start commands, Node version, contract ID, RPC endpoint and health check. Render assigns the public URL and supplies `RENDER_EXTERNAL_URL`; the API uses it for its allowed browser origin. Do not upload local `.env` files or credential files.

After deployment, verify:

1. `/api/health` and `/api/config` return the correct testnet account.
2. `/api/batches/p-mu995h55.lil-akirabear.testnet%3Alive-mu995h55/history` returns three events ending at `AtRetailer`.
3. The home page and its assets load over HTTPS. **View live demo batch** shows the same finalized history without wallet connection.
4. Test wallet connection, signing and return navigation, plus camera QR scanning on a device with a camera. These browser flows are not proven by the API integration suite.

Share the assigned HTTPS URL in your portfolio. Add `?batch=p-mu995h55.lil-akirabear.testnet%3Alive-mu995h55` to link directly to the recorded sample. Label it a NEAR testnet demo; the chain records custody claims, not independent physical-product certification.

Render free web services sleep after inactivity and may take longer to load on the next visit. See [free hosting limitations](https://render.com/docs/free). Do not choose a paid plan unless you intend to incur its charges.

For other Node hosts, use the same build/start commands and environment variables. Set `CORS_ORIGIN` to the public HTTPS origin and configure `TRUST_PROXY_HOPS` to match that host's actual trusted proxy topology. Never set unrestricted proxy trust. `SERVE_FRONTEND=true` requires the built `frontend/dist` directory. Only that directory is exposed as static content.

The current rate limiter uses process memory, sufficient for this single-instance demo. Multi-instance production deployments need a shared rate-limit store. Hosting does not change contract ownership or require another deployment transaction.
