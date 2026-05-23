# Architecture Notes

## Ingestion Flow
1. **Trigger:** `LLMSDK.chatCompletion()` is called.
2. **Measurement:** Start time is recorded.
3. **Call:** Provider SDK (OpenAI/Anthropic) is executed.
4. **Processing:** Latency and token usage are calculated. PII redactor cleans request/response content.
5. **Dispatch:** A non-blocking HTTP POST is sent to the Ingestion Service.
6. **Storage:** Ingestion Service validates the schema and writes to the DB.

## Logging Strategy
- **Granularity:** Every LLM request is a log entry.
- **Privacy:** Regex-based PII redaction ensures no sensitive data (emails, credit cards, etc.) leaves the secure backend environment.
- **Resilience:** The SDK uses a timeout for the ingestion call to prevent it from hanging the main chat execution.

## Scaling Considerations
- **Ingestion Bottleneck:** The ingestion service can be scaled horizontally. For extreme loads, we recommend using a message queue (Kafka/RabbitMQ) between the SDK and the DB.
- **Read/Write Splitting:** Analytics queries should run against a read-replica to avoid impacting chat performance.

## Failure Handling Assumptions
- **SDK Resilience:** If the ingestion service is unreachable, the SDK logs an error to stderr but returns the LLM response to the user successfully.
- **PII Redaction:** Assumes a standard set of regex patterns. Complex PII detection should use ML models.
