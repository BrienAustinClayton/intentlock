"use client";

import React, { useState } from "react";
import { X } from "lucide-react";
import { AgentFormProps } from "../../componentTypes";
import { useAgentsManagement } from "../../hooks/useAgentsManagement";
import { createHostedAgentSchema } from "../../schemas";
import { Button } from "@/shared/presentation/components/Button";
import { Input } from "@/shared/presentation/components/Input";
import { ButtonVariantEnum } from "@/shared/enums";

export function CreateHostedAgentForm({ onClose }: AgentFormProps) {
  const [agentName, setAgentName] = useState<string>("My shopping agent");
  const { createHostedAgent, isCreatingHostedAgent } = useAgentsManagement();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const validationResult = createHostedAgentSchema.safeParse({ name: agentName });
    const isValidationFailed = !validationResult.success;
    const shouldBlockSubmission = isValidationFailed || isCreatingHostedAgent;

    if (shouldBlockSubmission) {
      return;
    }

    createHostedAgent({ name: validationResult.data.name }).then(() => {
      onClose();
    });
  };

  return (
    <div className="saas-card overflow-hidden mb-5">
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold">Create a shopping agent</h2>
            <p className="text-xs text-fg-muted max-w-xl">
              Sepilo runs this agent for you. It only shops for purchase requests you send, and every checkout still
              has to pass your spending rules. No keys or setup needed.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-fg-dim hover:text-fg hover:bg-fg/5"
          >
            <X className="w-4 h-4" strokeWidth={1.8} />
          </button>
        </div>

        <label className="block space-y-1.5 max-w-sm">
          <span className="block text-[13px] font-medium text-fg-2">Name</span>
          <Input
            required
            maxLength={100}
            value={agentName}
            onChange={setAgentName}
            placeholder="e.g. My shopping agent"
          />
        </label>

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            variant={ButtonVariantEnum.Primary}
            disabled={!agentName.trim()}
            isLoading={isCreatingHostedAgent}
          >
            Create agent
          </Button>
          <Button
            type="button"
            variant={ButtonVariantEnum.Outline}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
