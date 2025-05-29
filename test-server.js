// Simple test script to verify the MCP server is working
import axios from 'axios';

const SERVER_URL = 'http://localhost:5001';

async function testServer() {
  try {
    console.log('🧪 Testing MCP Lightsail Deployment Server...\n');

    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);

    // Test MCP initialization
    console.log('\n2. Testing MCP initialization...');
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };

    const initResponse = await axios.post(`${SERVER_URL}/mcp`, initRequest, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      }
    });
    console.log('✅ MCP initialization successful');

    // Test tools list
    console.log('\n3. Testing tools list...');
    const toolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };

    const sessionId = initResponse.headers['mcp-session-id'];
    const toolsResponse = await axios.post(`${SERVER_URL}/mcp`, toolsRequest, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      }
    });

    console.log('✅ Available tools:');
    
    // Parse SSE response
    let toolsData;
    if (typeof toolsResponse.data === 'string' && toolsResponse.data.includes('data: ')) {
      const dataLine = toolsResponse.data.split('\n').find(line => line.startsWith('data: '));
      if (dataLine) {
        const jsonStr = dataLine.substring(6); // Remove 'data: '
        toolsData = JSON.parse(jsonStr);
      }
    } else {
      toolsData = toolsResponse.data;
    }
    
    if (toolsData && toolsData.result && toolsData.result.tools) {
      toolsData.result.tools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.annotations.description}`);
      });
    } else {
      console.log('   Raw response:', toolsResponse.data);
    }

    // Test get_all_deployments tool
    console.log('\n4. Testing get_all_deployments tool...');
    const deploymentsRequest = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'get_all_deployments',
        arguments: {}
      }
    };

    const deploymentsResponse = await axios.post(`${SERVER_URL}/mcp`, deploymentsRequest, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'mcp-session-id': sessionId
      }
    });

    console.log('✅ Deployments list retrieved successfully');
    
    // Parse SSE response for deployments
    let deploymentsData;
    if (typeof deploymentsResponse.data === 'string' && deploymentsResponse.data.includes('data: ')) {
      const dataLine = deploymentsResponse.data.split('\n').find(line => line.startsWith('data: '));
      if (dataLine) {
        const jsonStr = dataLine.substring(6); // Remove 'data: '
        deploymentsData = JSON.parse(jsonStr);
      }
    } else {
      deploymentsData = deploymentsResponse.data;
    }
    
    if (deploymentsData && deploymentsData.result && deploymentsData.result.content) {
      const deployments = JSON.parse(deploymentsData.result.content[0].text);
      console.log(`   Found ${deployments.length} active deployments`);
    } else {
      console.log('   Raw deployments response:', deploymentsResponse.data);
    }

    console.log('\n🎉 All tests passed! MCP server is working correctly.');
    console.log('\n📋 Server Information:');
    console.log(`   - Health endpoint: ${SERVER_URL}/health`);
    console.log(`   - MCP endpoint: ${SERVER_URL}/mcp`);
    console.log(`   - SSE endpoint: ${SERVER_URL}/sse/:sessionId`);
    console.log('\n🚀 Ready for Vercel AI SDK integration!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run tests if server is running
testServer();
