import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSearchParams } from "react-router";
import { SCDFormEditor } from "./form-editor";
import { SCDJsonEditor } from "./code-editor";

const SCDBuilder = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const handleEditModeChange = (mode: "form" | "json") => {
    setSearchParams((s) => {
      s.set("mode", mode);
      return s;
    });
  };

  return (
    <div className="w-full">
      <Tabs
        value={searchParams.get("mode") || "form"}
        onValueChange={(v) => handleEditModeChange(v as "form" | "json")}
      >
        <TabsList>
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="form">
          <SCDFormEditor />
        </TabsContent>

        <TabsContent value="json">
          <SCDJsonEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SCDBuilder;
