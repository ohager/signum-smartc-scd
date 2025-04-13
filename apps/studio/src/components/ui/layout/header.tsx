export function Header() {
  return (
    <header className="h-14 border-b px-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h1 className="font-bold text-lg">SmartC Studio</h1>
      </div>
      <div className="flex items-center gap-4">
        {/* Add toolbar items like Save, Deploy, etc */}
      </div>
    </header>
  );
}
