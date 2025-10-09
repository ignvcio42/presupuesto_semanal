import { HydrateClient } from "~/trpc/server";
import { BudgetApp } from "./_components/budget-app";

export default async function Home() {
  return (
    <HydrateClient>
      <main className="min-h-screen bg-gray-50">
        <BudgetApp />
      </main>
    </HydrateClient>
  );
}
