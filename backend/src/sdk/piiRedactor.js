/**
 * Simple PII Redactor using regex patterns.
 */
class PIIRedactor {
  static patterns = {
    email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    phone: /\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/g,
  };

  static redact(text) {
    if (!text || typeof text !== 'string') return text;
    
    let redacted = text;
    redacted = redacted.replace(this.patterns.email, '[EMAIL_REDACTED]');
    redacted = redacted.replace(this.patterns.ssn, '[SSN_REDACTED]');
    redacted = redacted.replace(this.patterns.creditCard, '[CC_REDACTED]');
    redacted = redacted.replace(this.patterns.phone, '[PHONE_REDACTED]');
    
    return redacted;
  }
}

module.exports = PIIRedactor;
