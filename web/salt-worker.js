// Finds a CREATE2 salt whose token address ends in 7777 (required by flap.sh tax tokens).
// Runs off the main thread so the page stays smooth. One keccak per try:
// address = last 20 bytes of keccak256(0xff ++ portal ++ salt ++ keccak256(initCode)).
importScripts("https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js");
onmessage = ({ data }) => {
  const E = self.ethers;
  const buf = new Uint8Array(85);
  buf[0] = 0xff;
  buf.set(E.getBytes(data.portal), 1);
  // first 16 bytes: the strategy (see saltPrefix in core.js), then 12 random bytes, then a counter
  const salt = crypto.getRandomValues(new Uint8Array(32));
  if (data.prefix) salt.set(E.getBytes(data.prefix), 0);
  buf.set(E.getBytes(data.initHash), 53);
  for (let i = 0; ; i++) {
    // bump the last 4 bytes of the salt as a counter
    salt[28] = i >>> 24; salt[29] = (i >>> 16) & 255; salt[30] = (i >>> 8) & 255; salt[31] = i & 255;
    buf.set(salt, 21);
    const h = E.keccak256(buf);
    if (h.endsWith("7777")) {
      postMessage({ salt: E.hexlify(salt), address: E.getAddress("0x" + h.slice(-40)), tries: i + 1 });
      return;
    }
  }
};
