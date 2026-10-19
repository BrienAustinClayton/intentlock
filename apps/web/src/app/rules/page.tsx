import { Suspense } from "react";
import { RulesPage } from "@/features/rules/presentation/pages/RulesPage";

export default function Page() {
  return (
    <Suspense>
      <RulesPage />
    </Suspense>
  );
}
