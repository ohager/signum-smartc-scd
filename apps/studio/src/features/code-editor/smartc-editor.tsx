import { useCallback, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { SaveIcon, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProjectFile } from "@/types/project.ts";

interface Props {
  file: ProjectFile;
}

export function SmartCEditor({ file }: Props) {
  const [code, setCode] = useState(file.data);
  const [isDirty, setIsDirty] = useState(false);
  const [isValid, setIsValid] = useState(true);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      setIsDirty(true);
      setIsValid(true);

    }
  };

  const handleSave = useCallback(() => {
    if (isValid) {
      setIsDirty(false);
    }
  }, [code, isValid]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    // Register SmartC-specific API functions for autocompletion
    monaco.languages.registerCompletionItemProvider("c", {
      provideCompletionItems: (model, position) => {
        const suggestions = [
          // SmartC-specific types
          {
            label: "long",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "SmartC 64-bit type",
          },
          {
            label: "dlong",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "SmartC 128-bit type",
          },
          {
            label: "fixed",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "SmartC fixed-point type",
          },
          {
            label: "dfixed",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "SmartC double fixed-point type",
          },

          // SmartC-specific keywords
          {
            label: "exit",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "Exit the contract execution",
          },
          {
            label: "throw",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "Throw an exception",
          },
          {
            label: "halt",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "Halt the contract execution",
          },
          {
            label: "sleep",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "Put contract to sleep",
          },
          {
            label: "zeroize",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "Set memory to zero",
          },
          {
            label: "assert",
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "Assert a condition",
          },

          // Signum API functions
          {
            label: "sendAmount",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Send amount to an address",
            insertText: "sendAmount(${1:address}, ${2:amount})",
          },
          {
            label: "sendQuantity",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Send token quantity",
            insertText: "sendQuantity(${1:address}, ${2:quantity})",
          },
          {
            label: "sendMessage",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Send a message",
            insertText: "sendMessage(${1:address}, ${2:message})",
          },
          {
            label: "getCreator",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get contract creator address",
            insertText: "getCreator()",
          },
          {
            label: "getCurrentTx",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get current transaction ID",
            insertText: "getCurrentTx()",
          },
          {
            label: "getBytesForTx",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get bytes for transaction",
            insertText: "getBytesForTx(${1:txId})",
          },
          {
            label: "verifyTxSignature",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Verify transaction signature",
            insertText: "verifyTxSignature(${1:txId})",
          },
          {
            label: "getTxTimestamp",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get transaction timestamp",
            insertText: "getTxTimestamp(${1:txId})",
          },
          {
            label: "getTransactionHeight",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get transaction height",
            insertText: "getTransactionHeight()",
          },
          {
            label: "getBlockTimestamp",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get block timestamp",
            insertText: "getBlockTimestamp()",
          },
          {
            label: "getNextTx",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get next transaction",
            insertText: "getNextTx(${1:txId})",
          },
          {
            label: "readShortMessage",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Read short message",
            insertText: "readShortMessage(${1:txId})",
          },
          {
            label: "readLongMessage",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Read long message",
            insertText: "readLongMessage(${1:txId})",
          },
          {
            label: "getPrevBlockHash",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get previous block hash",
            insertText: "getPrevBlockHash()",
          },
          {
            label: "getRemainingAmount",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get remaining amount",
            insertText: "getRemainingAmount()",
          },
          {
            label: "getRandomBytes",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get random bytes",
            insertText: "getRandomBytes()",
          },
          {
            label: "addHalfFee",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Add half fee",
            insertText: "addHalfFee()",
          },

          // Asset functions
          {
            label: "getAssetBalance",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get asset balance",
            insertText: "getAssetBalance(${1:assetId})",
          },
          {
            label: "sendAssetQuantity",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Send asset quantity",
            insertText:
              "sendAssetQuantity(${1:address}, ${2:assetId}, ${3:quantity})",
          },
          {
            label: "issueAsset",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Issue new asset",
            insertText:
              "issueAsset(${1:name}, ${2:description}, ${3:quantity}, ${4:decimals})",
          },
          {
            label: "distributeToHolders",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Distribute to asset holders",
            insertText: "distributeToHolders(${1:assetId}, ${2:amount})",
          },
          {
            label: "mintAsset",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Mint additional asset quantity",
            insertText: "mintAsset(${1:assetId}, ${2:quantity})",
          },
          {
            label: "transferAsset",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Transfer asset ownership",
            insertText: "transferAsset(${1:assetId}, ${2:recipient})",
          },

          // Contract management
          {
            label: "getBytecode",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get contract bytecode",
            insertText: "getBytecode()",
          },
          {
            label: "getFrequencyDivider",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get contract frequency divider",
            insertText: "getFrequencyDivider()",
          },
          {
            label: "setFrequencyDivider",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Set contract frequency divider",
            insertText: "setFrequencyDivider(${1:divider})",
          },
          {
            label: "getActivationAmount",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get contract activation amount",
            insertText: "getActivationAmount()",
          },
          {
            label: "restart",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Restart contract",
            insertText: "restart()",
          },
          {
            label: "stop",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Stop contract",
            insertText: "stop()",
          },

          // Map functions
          {
            label: "setMapValue",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Set map value",
            insertText: "setMapValue(${1:key}, ${2:value})",
          },
          {
            label: "getMapValue",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Get map value",
            insertText: "getMapValue(${1:key})",
          },
          {
            label: "putMapValue",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Put value in map",
            insertText: "putMapValue(${1:key}, ${2:value})",
          },

          // Other Signum-specific functions
          {
            label: "moveAmount",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Move amount between contracts",
            insertText: "moveAmount(${1:to}, ${2:amount})",
          },
          {
            label: "checkSignature",
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Check signature",
            insertText:
              "checkSignature(${1:message}, ${2:publicKey}, ${3:signature})",
          },
        ];

        return {
          suggestions: suggestions,
        };
      },
    });

    // Add hover information for SmartC API functions
    monaco.languages.registerHoverProvider("c", {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        const functionInfo: Record<string, string> = {
          sendAmount:
            "Sends Signa to a specified address.\n\n**Parameters**:\n- address: The recipient's address\n- amount: Amount in NQT (0.00000001 Signa)",
          getCreator: "Returns the address of the contract creator.",
          getCurrentTx: "Returns the current transaction ID.",
          // Add more function documentation as needed
        };

        if (functionInfo[word.word]) {
          return {
            contents: [
              { value: "**SmartC API Function**" },
              { value: functionInfo[word.word] },
            ],
          };
        }

        return null;
      },
    });
  };

  return (
    <div>
      <section className="w-full flex justify-between items-center p-1">
        <div>
          {!isValid && (
            <span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <FileWarning className="h-4 w-4 text-yellow-100" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Invalid SmartC code - Check for errors
                </TooltipContent>
              </Tooltip>
            </span>
          )}
        </div>
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  disabled={!isValid}
                  className="disabled:cursor-none"
                >
                  <SaveIcon
                    className={isDirty ? "text-red-400" : "text-green-400"}
                  />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isDirty ? "Unsaved changes" : "All Saved"}
            </TooltipContent>
          </Tooltip>
        </div>
      </section>
      <div className="p-1 rounded h-[600px]">
        <Editor
          height="100%"
          defaultLanguage="c"
          value={code}
          theme="vs-dark"
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontSize: 14,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            lineNumbers: "on",
            glyphMargin: true,
            snippetSuggestions: "top",
            suggestOnTriggerCharacters: true,
          }}
        />
      </div>
    </div>
  );
}
