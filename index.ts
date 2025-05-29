import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "dotenv/config";

const server = new McpServer({
  name: "mcp-server",
  version: "1.0.0",
});

server.tool(
    'getDirectoryStructure',
    {
        directoryName: z.string().describe('Directory name'),
    },
    async ({directoryName}) => {
        try {
            const directoryStructure = null;
            return directoryStructure;
        } catch (error) {
            console.error(error);
            return {
                content: [
                    {
                        type: "text",
                        text: error.message
                    }
                ]
            }
        }
    }
    
)

const transport = new StdioServerTransport();
await server.connect(transport);