require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const LLMSDK = require('./sdk');

const app = express();
const prisma = new PrismaClient();
const sdk = new LLMSDK({ 
  ingestionEndpoint: process.env.INGESTION_URL || 'http://localhost:3001/api/logs' 
});

// Active streaming requests by conversation
const activeStreams = new Map();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// List conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20
    });
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation with messages
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Chat Message with optional Streaming
app.post('/api/chat', async (req, res) => {
  const { conversationId, provider, model, message, sessionId, stream = false } = req.body;
  
  try {
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    }
    
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          title: message.substring(0, 50),
          provider,
          model,
          sessionId: sessionId || null,
        }
      });
    }

    if (conversation.cancelledAt) {
      return res.status(409).json({ error: 'Conversation is canceled' });
    }

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: message,
      }
    });

    if (stream) {
      // SSE Streaming Implementation
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Get short context (including the message just saved)
      const previousMessages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      const context = previousMessages.reverse().map(m => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      activeStreams.set(conversation.id, controller);

      let fullContent = '';

      // Send initial meta
      res.write(`event: meta\ndata: ${JSON.stringify({ conversationId: conversation.id })}\n\n`);

      try {
        for await (const chunk of sdk.chatCompletionStream(
          {
            provider,
            model,
            messages: context,
            conversationId: conversation.id,
            sessionId: conversation.sessionId,
          },
          { signal: controller.signal }
        )) {
          if (chunk?.delta) {
            fullContent += chunk.delta;
            res.write(`data: ${JSON.stringify({ content: chunk.delta })}\n\n`);
          }
        }
      } finally {
        activeStreams.delete(conversation.id);
      }

      // If canceled, don't persist an assistant message
      if (controller.signal.aborted) {
        res.write('event: done\ndata: {"status":"canceled"}\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: fullContent,
        }
      });

      res.write('event: done\ndata: {"status":"ok"}\n\n');
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Non-streaming path (uses SDK)
    // Get context
    const previousMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    const context = previousMessages.reverse().map(m => ({
      role: m.role,
      content: m.content
    }));

    const response = await sdk.chatCompletion({
      provider,
      model,
      messages: context,
      conversationId: conversation.id,
    });

    // Save assistant message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: response.content,
      }
    });

    res.json({
      conversationId: conversation.id,
      reply: response.content,
      usage: response.usage
    });

  } catch (error) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Cancel conversation
app.post('/api/conversations/:id/cancel', async (req, res) => {
  try {
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { cancelledAt: new Date() }
    });

    const controller = activeStreams.get(req.params.id);
    if (controller) controller.abort();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard Metrics
app.get('/api/analytics', async (req, res) => {
  try {
    const logs = await prisma.inferenceLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    
    const stats = await prisma.inferenceLog.aggregate({
      _avg: { latencyMs: true },
      _sum: { totalTokens: true },
      _count: { id: true }
    });

    res.json({ logs, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend API running on port ${PORT}`);
});
