const { z } = require('zod');

const logSchema = z.object({
  conversationId: z.string(),
  sessionId: z.string().optional(),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  status: z.enum(['success', 'error']),
  errorMessage: z.string().optional(),
  requestPreview: z.string().optional(),
  responsePreview: z.string().optional(),
});

module.exports = { logSchema };
