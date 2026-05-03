/**
 * AI Chat Prompt Testing Script
 * 
 * Tests the AI chat functionality with specific C2-related prompts:
 * 1. List all active implants and their current status with traffic stats.
 * 2. Generate a stealth implant config for Windows 11 with Spotify traffic blending and anti-VM evasion.
 * 3. Compile and deploy the implant to Node-03 with auto-start enabled.
 * 4. Show me real-time Hysteria2 traffic statistics for all nodes.
 */

const BASE_URL = "http://localhost:3000";

const PROMPTS = [
  "List all active implants and their current status with traffic stats.",
  "Generate a stealth implant config for Windows 11 with Spotify traffic blending and anti-VM evasion.",
  "Compile and deploy the implant to Node-03 with auto-start enabled.",
  "Show me real-time Hysteria2 traffic statistics for all nodes."
];

// Admin credentials (from setup-admin.js)
const ADMIN_CREDENTIALS = {
  username: "admin",
  password: "DPanel@2024!Secure"
};

let authCookies = "";

async function login() {
  console.log("🔐 Logging in as admin...");
  
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ADMIN_CREDENTIALS)
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }

  // Extract cookies from the response
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    // Parse cookies and format them for subsequent requests
    authCookies = setCookieHeader.split(', ').map(cookie => {
      return cookie.split(';')[0];
    }).join('; ');
    console.log("✅ Login successful, cookies extracted");
  } else {
    throw new Error("No cookies received from login");
  }
  
  const data = await response.json();
  return data;
}

async function createConversation(title: string) {
  console.log(`📝 Creating conversation: ${title}`);
  
  const response = await fetch(`${BASE_URL}/api/admin/ai/conversations`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Cookie": authCookies
    },
    body: JSON.stringify({
      title: title
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Conversation creation failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  return data.conversation.id;
}

async function sendChatPrompt(prompt: string, conversationId: string) {
  console.log(`\n📤 Sending prompt: "${prompt}"`);
  
  const response = await fetch(`${BASE_URL}/api/admin/ai/chat`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Cookie": authCookies
    },
    body: JSON.stringify({
      conversationId,
      message: prompt
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Chat request failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  return data;
}

async function testPrompt(prompt: string, index: number) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST ${index + 1}/${PROMPTS.length}`);
  console.log(`${"=".repeat(60)}`);
  
  try {
    // Create a conversation for this test
    const conversationTitle = `Test ${index + 1}: ${prompt.substring(0, 30)}...`;
    const conversationId = await createConversation(conversationTitle);
    console.log(`✅ Conversation created: ${conversationId}`);
    
    const result = await sendChatPrompt(prompt, conversationId);
    
    console.log("\n📥 AI Response:");
    console.log(JSON.stringify(result, null, 2));
    
    // Check if there was an error
    if (result.error) {
      console.log(`\n❌ Error in response: ${result.error}`);
      return false;
    }
    
    // Extract the last AI message
    const messages = result.messages || [];
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage) {
      console.log(`\n💬 Last message (${lastMessage.role}):`);
      console.log(lastMessage.content);
    }
    
    console.log(`\n✅ Test ${index + 1} completed successfully`);
    return true;
    
  } catch (error) {
    console.log(`\n❌ Test ${index + 1} failed:`, error);
    return false;
  }
}

async function main() {
  console.log("🚀 Starting AI Chat Prompt Tests");
  console.log(`${"=".repeat(60)}`);
  
  try {
    // Login first
    const loginResult = await login();
    
    // Set auth token from cookies (we'll use cookie-based auth)
    // The login response should set cookies automatically
    
    // Run each test
    const results = [];
    for (let i = 0; i < PROMPTS.length; i++) {
      const success = await testPrompt(PROMPTS[i], i);
      results.push({ prompt: PROMPTS[i], success });
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Summary
    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 TEST SUMMARY");
    console.log(`${"=".repeat(60)}`);
    
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`Total tests: ${PROMPTS.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    results.forEach((result, index) => {
      const status = result.success ? "✅" : "❌";
      console.log(`${status} Test ${index + 1}: ${result.prompt.substring(0, 50)}...`);
    });
    
    if (failed > 0) {
      console.log("\n⚠️  Some tests failed. Review the errors above.");
      process.exit(1);
    } else {
      console.log("\n🎉 All tests passed!");
      process.exit(0);
    }
    
  } catch (error) {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  }
}

// Run the tests
main();