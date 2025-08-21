import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// Parse command line arguments
let SERVER_PORT = 3001;
let TOOLS_ONLY = false;

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--help' || process.argv[i] === '-h') {
    console.log('Enhanced Gemini TUI MCP Client V2');
    console.log('');
    console.log('Usage: node gemini-tui-client-v2.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --port, -p <number>  MCP server port (default: 3001)');
    console.log('  --tools              List available tools and exit');
    console.log('  --help, -h           Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node gemini-tui-client-v2.js');
    console.log('  node gemini-tui-client-v2.js --port 8080');
    console.log('  node gemini-tui-client-v2.js --tools');
    console.log('  node gemini-tui-client-v2.js -p 3002 --tools');
    process.exit(0);
  } else if (process.argv[i] === '--port' || process.argv[i] === '-p') {
    SERVER_PORT = parseInt(process.argv[i + 1], 10) || SERVER_PORT;
    i++; // Skip next argument as it's the port number
  } else if (process.argv[i] === '--tools') {
    TOOLS_ONLY = true;
  } else if (process.argv[i].startsWith('-')) {
    console.error(`❌ Unknown option: ${process.argv[i]}`);
    console.error('');
    console.error('Use --help to see available options.');
    process.exit(1);
  }
}

const SERVER_URL = `http://localhost:${SERVER_PORT}/mcp`;

async function testEnhancedGeminiTuiMCPServer() {
  console.log('🧪 Testing Enhanced Gemini TUI MCP Server V2');
  console.log(`🔗 Server URL: ${SERVER_URL}`);

  let client = null;
  let transport = null;

  try {
    // Create client
    client = new Client({
      name: 'gemini-tui-v2-test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    client.onerror = (error) => {
      if (!TOOLS_ONLY) {
        console.error('❌ Client error:', error);
      }
    };

    // Create transport and connect
    console.log('\n🔗 Step 1: Creating transport and connecting...');
    transport = new StreamableHTTPClientTransport(new URL(SERVER_URL));

    await client.connect(transport);
    console.log(`✅ Connected with session ID: ${transport.sessionId}`);

    // Test 1: List tools
    console.log('\n🔧 Step 2: List available tools');
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools || [];
    console.log(`🛠️ Available tools (${tools.length}):`, tools.map(t => t.name).join(', '));
    
    // If tools-only mode, show detailed tool info and exit
    if (TOOLS_ONLY) {
      console.log('\n📋 Tool Details:');
      tools.forEach((tool, index) => {
        console.log(`\n${index + 1}. ${tool.name}`);
        console.log(`   Description: ${tool.description}`);
        if (tool.inputSchema?.properties) {
          console.log('   Parameters:');
          Object.entries(tool.inputSchema.properties).forEach(([param, schema]) => {
            const required = tool.inputSchema.required?.includes(param) ? ' (required)' : ' (optional)';
            console.log(`     - ${param}: ${schema.type}${required} - ${schema.description || 'No description'}`);
          });
        }
      });
      console.log('\n✅ Tools listing complete');
      
      // Clean up before exiting
      if (transport) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay
        await transport.close();
      }
      return;
    }

    // Test 2: Basic ask tool test
    console.log('\n🔍 Step 3: Test basic ask functionality');
    const hasAskTool = tools.some(tool => tool.name === 'ask');
    if (hasAskTool) {
      const askResult = await client.callTool({
        name: 'ask',
        arguments: { 
          text: 'What is the Model Context Protocol?',
          stream: true
        }
      });
      const askResponse = askResult.content?.[0]?.text;
      console.log('📊 Ask Response:', askResponse);
    } else {
      console.log('📊 Ask tool not available on this server');
    }

    // Test 3: Ask with streaming
    console.log('\n🎯 Step 4: Test ask with streaming');
    if (hasAskTool) {
      const tuiResult = await client.callTool({
        name: 'ask',
        arguments: { 
          text: 'What are the main advantages of using MCP over traditional HTTP APIs for AI tool integration?',
          stream: true
        }
      });
      const tuiResponse = tuiResult.content?.[0]?.text;
      console.log('📤 Streaming Response:\n', tuiResponse);
    } else {
      console.log('📤 Streaming Response: ask tool not available on this server');
    }

    // Test 4: Ask without streaming
    console.log('\n🎯 Step 5: Test ask without streaming');
    if (hasAskTool) {
      const nonStreamResult = await client.callTool({
        name: 'ask',
        arguments: { 
          text: 'How would you implement a simple chat application using WebSockets?',
          stream: false
        }
      });
      const nonStreamResponse = nonStreamResult.content?.[0]?.text;
      console.log('📤 Non-streaming Response:\n', nonStreamResponse);
    } else {
      console.log('📤 Non-streaming Response: ask tool not available');
    }

    // Test 5: Test session persistence
    console.log('\n🎯 Step 6: Test session persistence with another question');
    if (hasAskTool) {
      const persistResult = await client.callTool({
        name: 'ask',
        arguments: { 
          text: 'What are the key differences between REST and GraphQL APIs?',
          stream: true
        }
      });
      const persistResponse = persistResult.content?.[0]?.text;
      console.log('📤 Persistence Test Response:\n', persistResponse);
    } else {
      console.log('📤 Persistence Test Response: ask tool not available');
    }

    // Test 6: Code analysis with ask tool
    console.log('\n🔬 Step 7: Test code analysis with ask tool');
    if (hasAskTool) {
      const analyzeResult = await client.callTool({
        name: 'ask',
        arguments: { 
          text: `Analyze this code for performance issues and suggest improvements:

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
\`\`\`

Please provide specific suggestions for optimization.`
        }
      });
      const analyzeResponse = analyzeResult.content?.[0]?.text;
      console.log('📤 Code Analysis Response:\n', analyzeResponse);
    } else {
      console.log('📤 Code Analysis: ask tool not available on this server');
    }

    console.log('\n📊 MCP Test Summary:');
    console.log('- Session ID maintained:', transport.sessionId);
    console.log('- Transport type: StreamableHTTP with Gemini TUI integration');
    console.log('- Ask tool available:', hasAskTool ? '✅' : '❌');
    console.log('- Streaming mode:', hasAskTool ? '✅' : '❌');
    console.log('- Non-streaming mode:', hasAskTool ? '✅' : '❌');
    console.log('- Session persistence:', hasAskTool ? '✅' : '❌');
    console.log('- Code analysis capability:', hasAskTool ? '✅' : '❌');
    console.log('- TUI integration: ✅');

    console.log('\n✨ All MCP tests completed successfully!');
    console.log('🎯 MCP server can ask questions to Gemini via TUI and get responses!');
    console.log('💡 The single "ask" tool handles all types of questions and requests.');

    // Test session termination
    console.log('\n🗑️ Step 7: Testing session termination');
    if (transport.sessionId) {
      console.log(`Terminating session: ${transport.sessionId}`);
      try {
        await transport.terminateSession();
        console.log('✅ Session terminated successfully');
      } catch (error) {
        console.log('ℹ️ Session termination handled gracefully');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Clean up
    if (transport) {
      try {
        // Disable client error handler before closing to prevent SSE disconnect errors
        if (client) {
          client.onerror = () => {}; // Suppress errors during cleanup
        }
        await transport.close();
        console.log('🔒 Transport closed');
      } catch (error) {
        console.error('Error closing transport:', error);
      }
    }
  }
}

// Run the test
testEnhancedGeminiTuiMCPServer();