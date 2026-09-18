import { Buffer } from 'buffer';
// MyNearWallet v10 serializes signed requests through the Buffer global.
// Browsers do not provide it, so initialize before importing the wallet module.
if (!('Buffer' in globalThis)) Object.assign(globalThis, { Buffer });
