/**
 * Shared configuration and types for the agent-to-agent service.
 */

import { config } from "dotenv";
config();

export const NETWORK = (process.env.NETWORK || "testnet") as
  | "testnet"
  | "testnet2"
  | "mainnet";

export const ORACLE_API_KEY=process.env.ORACLE_API_KEY || "";

export const AGENT_A = {
  mnemonic: process.env.AGENT_A_MNEMONIC || "",
  nametag: process.env.AGENT_A_NAMETAG || "enricher",
};

export const AGENT_B = {
  mnemonic: process.env.AGENT_B_MNEMONIC || "",
  nametag: process.env.AGENT_B_NAMETAG || "scout",
};

export const SERVICE = {
  price: process.env.SERVICE_PRICE || "1000000", // 1 UCT in base units
  coin: process.env.SERVICE_COIN || "UCT",
};

// --- Types ---

export interface ServiceRequest {
  task: string;
  data: Record<string, unknown>;
}

export interface ServiceResponse {
  task: string;
  result: Record<string, unknown>;
  timestamp: string;
}
