import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { MachineData } from "../machine-data.ts";
import { useMemo } from "react";

function formatHexView(hexString: string) {
  let formatted = "";
  for (let i = 0; i < hexString.length; i += 2) {
    formatted +=
      `${hexString[i]}${hexString[i + 1]}` + (i % 32 === 0 ? "\n" : " ");
  }
  return formatted;
}

export function BytecodeVisualizer({ data }: { data: MachineData }) {

  const formattedByteCode = useMemo(() => formatHexView(data.ByteCode), [data])

  return (
    <Tabs defaultValue="memory">
      <TabsList>
        <TabsTrigger value="memory">Memory Map</TabsTrigger>
        <TabsTrigger value="labels">Labels</TabsTrigger>
        <TabsTrigger value="hexview">Hex View</TabsTrigger>
      </TabsList>

      <TabsContent value="memory" className="m-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Memory Layout</CardTitle>
            <CardDescription>
              Variables and registers used in the contract
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="grid grid-cols-1 gap-1">
                {data.Memory.map((item, index) => (
                  <div key={item} className="flex items-center p-2 rounded-md">
                    <Badge variant="outline" className="mr-2 w-8 text-center">
                      {index}
                    </Badge>
                    <span className="font-mono text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="labels" className="m-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Code Labels</CardTitle>
            <CardDescription>Jump targets in the bytecode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-1">
              {data.Labels.map((item: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-2 rounded-md"
                >
                  <span className="font-mono text-sm">{item.label}</span>
                  <Badge variant="secondary">Address: {item.address}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="hexview" className="m-0">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bytecode Hex View</CardTitle>
            <CardDescription>
              Hexadecimal representation of the bytecode
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md p-3 font-mono text-sm overflow-x-auto">
              {formattedByteCode}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

