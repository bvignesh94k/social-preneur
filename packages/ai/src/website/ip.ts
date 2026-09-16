import { BlockList, isIP } from "node:net";

const blocked = new BlockList();

const IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const IPV6_RANGES: [string, number][] = [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
];

for (const [network, prefix] of IPV4_RANGES) blocked.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of IPV6_RANGES) blocked.addSubnet(network, prefix, "ipv6");

// True for loopback, private, link-local (including cloud metadata) and other non-public addresses.
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return blocked.check(address, "ipv4");
  if (version !== 6) return true;

  const embedded = address.match(/^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (embedded?.[1]) return blocked.check(embedded[1], "ipv4");
  if (/^(?:::ffff:|64:ff9b::)/i.test(address)) return true;
  return blocked.check(address, "ipv6");
}
