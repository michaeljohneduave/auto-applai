import { UserButton } from "@clerk/clerk-react";

export default function Header() {
  return (
    <header className="flex justify-between items-center p-4 border-b">
      <h1 className="text-xl font-bold">Auto-Apply</h1>
      <UserButton />
    </header>
  );
}
