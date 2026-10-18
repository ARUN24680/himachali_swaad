import { generateKeyPairSync, createSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isAwsSnsUrl, stringToSign, verifySnsMessage, type SnsMessage } from '../../src/modules/alerts/sns';

const TOPIC = 'arn:aws:sns:ap-south-1:123456789012:pk-upi-alerts';
const CERT = 'https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

function signed(over: Partial<SnsMessage> = {}): SnsMessage {
  const m: SnsMessage = {
    Type: 'Notification',
    MessageId: 'm-1',
    TopicArn: TOPIC,
    Message: '{"hello":"world"}',
    Timestamp: new Date().toISOString(),
    SignatureVersion: '2',
    Signature: '',
    SigningCertURL: CERT,
    ...over,
  };
  const s = createSign('RSA-SHA256');
  s.update(stringToSign(m));
  return {
    ...m,
    Signature: s.sign(privateKey, 'base64'),
    ...('Signature' in over ? { Signature: over.Signature! } : {}),
  };
}

const opts = { topicArn: TOPIC, loadCert: async () => publicKey };

describe('SNS message verification', () => {
  it('accepts a correctly signed message from our topic', async () => {
    await expect(verifySnsMessage(signed(), opts)).resolves.toBeUndefined();
  });
  it('rejects a tampered message', async () => {
    const m = signed();
    await expect(verifySnsMessage({ ...m, Message: '{"hello":"evil"}' }, opts)).rejects.toThrow('bad SNS signature');
  });
  it('rejects another topic', async () => {
    await expect(verifySnsMessage(signed({ TopicArn: `${TOPIC}-other` }), opts)).rejects.toThrow('TopicArn');
  });
  it('rejects SHA-1 (SignatureVersion 1) and stale messages', async () => {
    await expect(verifySnsMessage(signed({ SignatureVersion: '1' }), opts)).rejects.toThrow('SignatureVersion 2');
    const old = new Date(Date.now() - 2 * 3600_000).toISOString();
    await expect(verifySnsMessage(signed({ Timestamp: old }), opts)).rejects.toThrow('stale');
  });
  it('never trusts a non-AWS certificate URL', async () => {
    await expect(verifySnsMessage(signed({ SigningCertURL: 'https://evil.example/cert.pem' }), opts)).rejects.toThrow(
      'SigningCertURL',
    );
    expect(isAwsSnsUrl('https://sns.ap-south-1.amazonaws.com.evil.com/x.pem')).toBe(false);
    expect(isAwsSnsUrl('http://sns.ap-south-1.amazonaws.com/x.pem')).toBe(false);
    expect(isAwsSnsUrl('https://sns.ap-south-1.amazonaws.com:8443/x.pem')).toBe(false);
    expect(isAwsSnsUrl(CERT)).toBe(true);
  });
});
