import 'dotenv/config';
import { llm } from './aseo/core/llm_client';

async function testLLM() {
  console.log('Testing LLM Connectivity to Ollama Cloud...');
  try {
    const response = await llm.generate({
      systemPrompt: 'You are a system verification assistant.',
      userPrompt: 'Hello! This is a connectivity test for the ASEO system. Please respond with "CONNECTION_SUCCESSFUL".',
      temperature: 0.1,
      responseFormat: 'text'
    });
    console.log('Response received:');
    console.log(response.content);
    if (response.content.includes('CONNECTION_SUCCESSFUL')) {
      console.log('✅ LLM Connection Verified Successfully!');
    } else {
      console.log('⚠️ LLM connected, but response was unexpected.');
    }
  } catch (error) {
    console.error('❌ LLM Connection Failed:');
    console.error(error);
    process.exit(1);
  }
}

testLLM();