import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs";

export function MainArea() {
  return (
    <Tabs defaultValue="editor" className="h-full flex flex-col w-full">
      <TabsList className="px-4 border-b w-full">
        <TabsTrigger value="abi">ABI Builder</TabsTrigger>
        <TabsTrigger value="editor">Editor</TabsTrigger>
        <TabsTrigger value="testbed">Testbed</TabsTrigger>
      </TabsList>

      <TabsContent value="editor" className="flex-1">
        {/* Code Editor Component */}
        <div className="h-full p-4">{/* Add code editor here */}</div>
      </TabsContent>

      <TabsContent value="abi" className="flex-1">
        {/* ABI Builder Interface */}
        <div className="h-full p-4">{/* Add ABI builder form here */}</div>
      </TabsContent>

      <TabsContent value="testbed" className="flex-1">
        {/* Testing Environment */}
        <div className="h-full p-4">{/* Add testing interface here */}</div>
      </TabsContent>
    </Tabs>
  );
}
