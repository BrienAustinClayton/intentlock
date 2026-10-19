import React from "react";

export type StepProgress = {
  current: number;
  total: number;
  label: string;
};

export type AuthFrameProps = {
  children: React.ReactNode;
  step: StepProgress | null;
  showSignOut: boolean;
  wide: boolean;
};

export type AuthFieldProps = {
  label: string;
  hint: string | null;
  children: React.ReactNode;
};

export type AuthOptionCardProps = {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string | null;
};

export type AuthChipProps = {
  selected: boolean;
  onClick: () => void;
  label: string;
};
