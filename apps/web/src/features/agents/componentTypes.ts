import { ShoppingAgent } from "./types";

export interface CopyAgentIdProps {
  value: string;
}

export interface AgentFormProps {
  onClose: () => void;
}

export interface AgentsTableProps {
  agents: ShoppingAgent[];
  onDisconnectAgent: (agent: ShoppingAgent) => void;
}
