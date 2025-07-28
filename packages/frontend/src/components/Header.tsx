import { UserButton } from "@clerk/clerk-react";

export default function Header() {
  return (
    <header className="flex items-center p-4">
      <div className="flex-1" />
      <div className="flex-1 text-center">
        <h1 className="text-xl font-bold">Auto-Apply</h1>
      </div>
      <div className="flex-1 flex justify-end">
        <UserButton />
      </div>
    </header>
  );
}
