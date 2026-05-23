const axios = require('axios');
const PIIRedactor = require('./piiRedactor');
const OpenAI = require('openai');
const { Anthropic } = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class LLMSDK {
  constructor(config = {}) {
    this.ingestionEndpoint = config.ingestionEndpoint || 'http://localhost:3001/api/logs';
    this.apiKey = config.apiKey;
    this.appName = config.appName || 'ChatbotApp';

    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.googleAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  /**
   * Wrap an LLM call to capture metrics and logs.
   */
  async chatCompletion(params) {
    const { provider, model, messages, conversationId, sessionId } = params;
    const requestTs = new Date();
    const startTime = Date.now();
    
    let result;
    try {
      // Mocking the actual LLM call for now, structure depends on provider
      result = await this._callProvider(params);
      
      const responseTs = new Date();
      const endTime = Date.now();
      const latencyMs = endTime - startTime;
      
      const promptTokens = result.usage?.prompt_tokens ?? this._estimateTokens(messages.map(m => m.content).join(' '));
      const completionTokens = result.usage?.completion_tokens ?? this._estimateTokens(result.completion);
      const totalTokens = result.usage?.total_tokens ?? (promptTokens + completionTokens);
      
      // Async logging (fire and forget)
      this._sendLog({
        conversationId,
        sessionId,
        provider,
        model,
        requestTs,
        responseTs,
        latencyMs,
        promptTokens,
        completionTokens,
        totalTokens,
        status: 'success',
        requestId: result.requestId,
        requestPreview: PIIRedactor.redact(JSON.stringify(messages)).substring(0, 1000),
        responsePreview: PIIRedactor.redact(result.completion).substring(0, 1000),
      }).catch(err => console.error('Logging failed:', err.message));

      return {
        content: result.completion,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens
        }
      };
    } catch (error) {
      const responseTs = new Date();
      const latencyMs = Date.now() - startTime;
      this._sendLog({
        conversationId,
        sessionId,
        provider,
        model,
        requestTs,
        responseTs,
        latencyMs,
        status: 'error',
        errorMessage: error.message,
        requestPreview: PIIRedactor.redact(JSON.stringify(messages)).substring(0, 1000),
      }).catch(err => console.error('Logging failed:', err.message));
      
      throw error;
    }
  }

  async _sendLog(payload) {
    // Fire and forget log to ingestion service
    return axios.post(this.ingestionEndpoint, payload, {
      timeout: 2000 // Don't block for long
    });
  }

  /**
   * Streaming wrapper: yields text deltas and logs on completion/cancel.
   *
   * Returns an async iterator of `{ delta }` chunks.
   */
  async *chatCompletionStream(params, options = {}) {
    const { provider, model, messages, conversationId, sessionId } = params;
    const { signal } = options;

    const requestTs = new Date();
    const startTime = Date.now();
    let full = '';
    let usage = null;
    let requestId = null;
    let status = 'success';
    let errorMessage = null;

    try {
      const prov = (provider || '').toLowerCase();
      if (prov.includes('openai') && process.env.OPENAI_API_KEY) {
        const stream = await this.openai.chat.completions.create(
          {
            model,
            messages,
            stream: true,
            stream_options: { include_usage: true }
          },
          { signal }
        );

        for await (const part of stream) {
          requestId = part?.id || requestId;
          if (part?.usage) usage = part.usage;

          const delta = part?.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            yield { delta };
          }
        }
      } else if ((prov.includes('gemini') || prov.includes('google')) && process.env.GEMINI_API_KEY) {
        const modelName = model || 'gemini-1.5-flash';
        console.log(`Using Gemini Model: ${modelName}`);
        const genAI = this.googleAI.getGenerativeModel({ model: modelName });
        
        // Convert messages to Gemini format
        const history = messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        }));
        const lastMsg = messages[messages.length - 1].content;

        const chat = genAI.startChat({ history });
        const result = await chat.sendMessageStream(lastMsg);

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          if (chunkText) {
            full += chunkText;
            yield { delta: chunkText };
          }
        }
      } else {
        // Fallback: non-stream call then chunk it to simulate streaming.
        const r = await this._callProvider(params);
        requestId = r.requestId;
        usage = r.usage;

        const words = (r.completion || '').split(/(\s+)/);
        for (const w of words) {
          if (signal?.aborted) throw new Error('canceled');
          full += w;
          yield { delta: w };
          await new Promise(r2 => setTimeout(r2, 20));
        }
      }
    } catch (error) {
      if (signal?.aborted || String(error?.message || '').toLowerCase().includes('canceled')) {
        status = 'canceled';
      } else {
        status = 'error';
        errorMessage = error.message;
      }
    } finally {
      const responseTs = new Date();
      const latencyMs = Date.now() - startTime;

      const promptTokens = usage?.prompt_tokens ?? this._estimateTokens(messages.map(m => m.content).join(' '));
      const completionTokens = usage?.completion_tokens ?? this._estimateTokens(full);
      const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens);

      this._sendLog({
        conversationId,
        sessionId,
        provider,
        model,
        requestTs,
        responseTs,
        latencyMs,
        promptTokens,
        completionTokens,
        totalTokens,
        status,
        errorMessage,
        requestId,
        requestPreview: PIIRedactor.redact(JSON.stringify(messages)).substring(0, 1000),
        responsePreview: PIIRedactor.redact(full).substring(0, 1000),
      }).catch(err => console.error('Logging failed:', err.message));
    }
  }

  _estimateTokens(text) {
    // Very rough estimation: ~4 chars per token
    return Math.ceil((text || '').length / 4);
  }

  async _callProvider(params) {
    const { provider, model, messages } = params;
    const prov = (provider || '').toLowerCase();

    // OpenAI (real)
    if (prov.includes('openai') && process.env.OPENAI_API_KEY) {
      const resp = await this.openai.chat.completions.create({
        model,
        messages,
      });

      return {
        completion: resp.choices?.[0]?.message?.content || '',
        usage: resp.usage || null,
        requestId: resp.id || null,
      };
    }

    // Anthropic (real)
    if (prov.includes('anthropic') && process.env.ANTHROPIC_API_KEY) {
      const system = messages.find(m => m.role === 'system')?.content;
      const anthroMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));

      const resp = await this.anthropic.messages.create({
        model,
        max_tokens: 800,
        system,
        messages: anthroMessages,
      });

      const text = (resp.content || []).map(p => (p.type === 'text' ? p.text : '')).join('');

      return {
        completion: text,
        usage: resp.usage
          ? {
              prompt_tokens: resp.usage.input_tokens,
              completion_tokens: resp.usage.output_tokens,
              total_tokens: resp.usage.input_tokens + resp.usage.output_tokens,
            }
          : null,
        requestId: resp.id || null,
      };
    }

    // Gemini (real)
    if ((prov.includes('gemini') || prov.includes('google')) && process.env.GEMINI_API_KEY) {
      const modelName = model || 'gemini-1.5-flash';
      console.log(`Using Gemini Model (non-stream): ${modelName}`);
      const genAI = this.googleAI.getGenerativeModel({ model: modelName });
      
      const history = messages.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));
      const lastMsg = messages[messages.length - 1].content;

      const chat = genAI.startChat({ history });
      const result = await chat.sendMessage(lastMsg);
      const text = result.response.text();

      return {
        completion: text,
        usage: {
          prompt_tokens: this._estimateTokens(messages.map(m => m.content).join(' ')),
          completion_tokens: this._estimateTokens(text),
          total_tokens: 0 // Will be calculated by caller
        },
        requestId: null
      };
    }

    // Fallback: simulated response (still useful for demo without keys)
    await new Promise(r => setTimeout(r, 350 + Math.random() * 450));
    return {
      completion: `[Simulated ${provider} response] to: "${messages[messages.length - 1].content}"`,
      usage: null,
      requestId: null,
    };
  }
}

module.exports = LLMSDK;
