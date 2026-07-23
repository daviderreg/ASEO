import axios from 'axios';

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
}

export interface LLMResponse {
  content: string;
  structuredData?: any;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export class LLMClient {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ASEO_LLM_API_KEY || '';
    this.apiUrl = process.env.ASEO_LLM_API_URL || 'https://ollama.com/v1/chat/completions';
    this.model = process.env.ASEO_LLM_MODEL || 'gemma 4 31b';

    if (!this.apiKey) {
      console.warn('[LLMClient] Warning: ASEO_LLM_API_KEY is not set in environment variables.');
    }
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      if (process.env.ASEO_MOCK_MODE === 'true') {
        return this.generateMockResponse(request);
      }
      throw new Error('ASEO_LLM_API_KEY is not configured');
    }

    const payload: any = {
      model: this.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt }
      ],
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens ?? 2000,
      },
      stream: false,
    };

    const maxRetries = 3;
    let attempt = 0;
    let response;

    while (attempt < maxRetries) {
      try {
        response = await axios.post(this.apiUrl, payload, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000 // 120 seconds timeout
        });
        break; // Success!
      } catch (error: any) {
        attempt++;
        const isTransient = error.response?.status === 429 || error.response?.status >= 500 || error.code === 'ECONNABORTED';
        
        if (!isTransient || attempt >= maxRetries) {
          console.error(`[LLMClient] API Call Error after ${attempt} attempts:`, error.response?.data || error.message);
          throw error;
        }

        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.warn(`[LLMClient] Transient error detected. Retrying in ${delay}ms... (Attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    const content = response!.data.message?.content || response!.data.choices?.[0]?.message?.content || '';
    let structuredData = null;

    if (request.responseFormat === 'json') {
      try {
        let cleanedContent = content.trim();
        
        // 1. Remove markdown code blocks if they encapsulate the content
        const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
        const match = codeBlockRegex.exec(cleanedContent);
        if (match && match[1]) {
          cleanedContent = match[1].trim();
        }

        // 2. Attempt to isolate the JSON object (find first { and last })
        const startIdx = cleanedContent.indexOf('{');
        const endIdx = cleanedContent.lastIndexOf('}');
        
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          cleanedContent = cleanedContent.substring(startIdx, endIdx + 1);
        }

        // 3. Basic sanitization for common LLM JSON errors
        cleanedContent = cleanedContent.replace(/,\s*([\]}])/g, '$1');
        
        structuredData = JSON.parse(cleanedContent);
      } catch (e: any) {
        console.error(`[LLMClient] JSON Parse Error: ${e.message}`);
        console.error('[LLMClient] Attempted to parse content:', content);
      }
    }

    return {
      content,
      structuredData,
      usage: response!.data.usage || {
        promptTokens: response!.data.prompt_eval_count || 0,
        completionTokens: response!.data.eval_count || 0,
        totalTokens: (response!.data.prompt_eval_count || 0) + (response!.data.eval_count || 0)
      }
    };
  }

  public setApiKey(key: string): void {
    this.apiKey = key;
  }

  public setModel(model: string): void {
    this.model = model;
  }

  private generateMockResponse(request: LLMRequest): LLMResponse {
    console.log(`[LLMClient-MOCK] Generating simulated response for prompt: ${request.userPrompt.substring(0, 50)}...`);
    
    let content = "This is a simulated AI response for system verification.";
    let structuredData = null;

    if (request.userPrompt.includes('strategic analysis') || request.userPrompt.includes('CTO')) {
      content = JSON.stringify({
        decision: 'PROCEED_TO_ARCHITECTURE',
        analysis: 'The goal is viable and aligns with system objectives.',
        nextStep: 'ARCHITECTED'
      });
    } else if (request.userPrompt.includes('architecture') || request.userPrompt.includes('ARCHITECT')) {
      content = JSON.stringify({
        decision: 'PROCEED_TO_PLANNING',
        architecture: 'Modular event-driven structure',
        nextStep: 'PLANNED'
      });
    } else if (request.userPrompt.includes('planning') || request.userPrompt.includes('PM')) {
      content = JSON.stringify({
        decision: 'PROCEED_TO_IMPLEMENTATION',
        plan: ['Task 1', 'Task 2'],
        nextStep: 'IMPLEMENTED'
      });
    }

    if (request.responseFormat === 'json') {
      try {
        structuredData = JSON.parse(content);
      } catch (e) {
        structuredData = { mock: true, message: "Fallback structured data" };
      }
    }

    return {
      content,
      structuredData,
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 }
    };
  }
}

export const llm = new LLMClient();