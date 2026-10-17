// Fictional data created for the Graph Hacks demo. No customer or company records.
export const services = [
  { id: 'checkout-web', name: 'Checkout Web', tier: 'customer', description: 'Customer checkout interface' },
  { id: 'checkout-api', name: 'Checkout API', tier: 'critical', description: 'Creates orders and coordinates payment' },
  { id: 'payments-api', name: 'Payments API', tier: 'critical', description: 'Authorizes and captures payments' },
  { id: 'fraud-engine', name: 'Fraud Engine', tier: 'critical', description: 'Scores transaction risk' },
  { id: 'ledger-db', name: 'Ledger DB', tier: 'critical', description: 'Records financial transactions' },
  { id: 'notification-worker', name: 'Notification Worker', tier: 'standard', description: 'Sends receipts and alerts' },
  { id: 'feature-flags', name: 'Feature Flags', tier: 'standard', description: 'Controls checkout rollout' }
];

export const dependencies = [
  ['checkout-web', 'checkout-api'],
  ['checkout-web', 'feature-flags'],
  ['checkout-api', 'payments-api'],
  ['checkout-api', 'notification-worker'],
  ['payments-api', 'fraud-engine'],
  ['payments-api', 'ledger-db']
];

export const people = [
  { id: 'maya', name: 'Maya Chen', role: 'Checkout lead' },
  { id: 'arjun', name: 'Arjun Rao', role: 'Payments on-call' },
  { id: 'lina', name: 'Lina Ortiz', role: 'Fraud engineer' },
  { id: 'noah', name: 'Noah Kim', role: 'Data platform lead' },
  { id: 'imani', name: 'Imani Brooks', role: 'Platform engineer' }
];

export const ownership = [
  ['maya', 'checkout-web'], ['maya', 'checkout-api'],
  ['arjun', 'payments-api'], ['lina', 'fraud-engine'],
  ['noah', 'ledger-db'], ['imani', 'notification-worker'],
  ['imani', 'feature-flags']
];

export const incidents = [
  { id: 'INC-1042', title: 'Payment capture retries exceed threshold', severity: 'high', status: 'open', detail: 'Intermittent duplicate retries during the new checkout path.', affected: 'payments-api' },
  { id: 'INC-1048', title: 'Fraud score latency regression', severity: 'medium', status: 'open', detail: 'P95 scoring latency rose after rule-set update.', affected: 'fraud-engine' },
  { id: 'INC-1031', title: 'Receipt delivery delay', severity: 'low', status: 'resolved', detail: 'Queue workers were scaled up and delivery recovered.', affected: 'notification-worker' }
];

export const release = {
  id: 'REL-2026-10-18',
  name: 'Checkout v2',
  version: '2.0.0',
  serviceId: 'checkout-web',
  summary: 'New payment experience with fraud scoring and gradual rollout.'
};
