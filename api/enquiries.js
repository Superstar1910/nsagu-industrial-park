// api/enquiries.js
// Vercel Serverless Function for handling website enquiries.
// Deployed at: /api/enquiries

// Helper: safely get JSON body (works even if req.body isn't parsed)
async function getJsonBody(req) {
  if (req.body) {
    // In some environments req.body is already an object or string
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch (e) {
        throw new Error('Invalid JSON in request body');
      }
    }
    return req.body;
  }

  // Fallback: manually read the stream
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        const json = data ? JSON.parse(data) : {};
        resolve(json);
      } catch (err) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = async (req, res) => {
  // Basic CORS headers (safe even if you don’t use cross-origin)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({
      status: 'error',
      message: 'Method not allowed. Use POST.'
    });
  }

  try {
    const body = await getJsonBody(req);

    const {
      name,
      email,
      organisation,
      role,
      message,
      source_page,
      phone,
      utm_source,
      honeypot
    } = body || {};

    // Honeypot anti-spam: if filled, silently ignore but respond "ok"
    if (honeypot && honeypot.trim() !== '') {
      console.log('Spam / bot submission detected (honeypot filled).');
      return res.status(200).json({ status: 'ok', message: 'Thanks.' });
    }

    // Validation
    const errors = {};

    // Name
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      errors.name = 'Name is required.';
    }

    // Email
    const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email)) {
      errors.email = 'Valid email required.';
    }

    // Message
    if (
      !message ||
      typeof message !== 'string' ||
      message.trim().length < 10
    ) {
      errors.message = 'Message is too short.';
    }

    // Role
    const allowedRoles = ['tenant', 'investor', 'partner', 'other'];
    if (!role || !allowedRoles.includes(role)) {
      errors.role = 'Invalid role.';
    }

    // Source page
    if (!source_page || typeof source_page !== 'string') {
      errors.source_page = 'Source page missing.';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        status: 'error',
        errors
      });
    }

    // Build entry object
    const enquiry = {
      name: name.trim(),
      email: email.trim(),
      organisation: organisation ? String(organisation).trim() : '',
      role,
      message: message.trim(),
      source_page: source_page.trim(),
      phone: phone ? String(phone).trim() : '',
      utm_source: utm_source ? String(utm_source).trim() : '',
      received_at: new Date().toISOString()
    }

    // --- PLACEHOLDER: store in DB or send email here ---
    // Example:
    // await db.insert('enquiries', enquiry);
    // await sendEmail(enquiry);

    // For now: log to Vercel logs so you can see it in the dashboard
    console.log('New Nsagu enquiry:', enquiry);

    return res.status(200).json({
      status: 'ok',
      message: 'Thank you. We have received your enquiry and will be in touch shortly.'
    });
  } catch (err) {
    console.error('Enquiry handler error:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong on our side. Please try again later.'
    });
  }
};
