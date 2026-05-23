const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { logSchema } = require('./validators/logSchema');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Ingestion Endpoint
app.post('/api/logs', async (req, res) => {
  try {
    const data = logSchema.parse(req.body);
    
    const log = await prisma.inferenceLog.create({
      data: {
        conversationId: data.conversationId,
        provider: data.provider,
        model: data.model,
        latencyMs: data.latencyMs,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        status: data.status,
        errorMessage: data.errorMessage,
        requestPreview: data.requestPreview,
        responsePreview: data.responsePreview,
      }
    });

    res.status(201).json({ success: true, logId: log.id });
  } catch (error) {
    console.error('Ingestion error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Ingestion Service running on port ${PORT}`);
});
