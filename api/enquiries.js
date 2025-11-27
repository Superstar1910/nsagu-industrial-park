// api/enquiries.js
// Vercel Serverless Function for handling website enquiries and emailing them.

// Import Resend for sending emails
const { Resend } = require('resend');

// Create Resend client using API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

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

    // Build clean enquiry object
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
    };

    // Log to Vercel logs
    console.log('New Nsagu enquiry:', enquiry);

    // ---- SEND EMAIL TO YOUR GMAIL VIA RESEND ----
    const toAddress = process.env.ENQUIRIES_TO;
    const fromAddress = process.env.ENQUIRIES_FROM || 'onboarding@resend.dev';

    if (!process.env.RESEND_API_KEY || !toAddress) {
      console.warn('Email not sent: RESEND_API_KEY or ENQUIRIES_TO not configured.');
    } else {
      const subject = `New Nsagu Park enquiry – ${enquiry.role} – ${enquiry.name}`;

      const textBody = `
New Nsagu Industrial Park enquiry

Name: ${enquiry.name}
Email: ${enquiry.email}
Organisation: ${enquiry.organisation || '-'}
Role: ${enquiry.role}
Phone: ${enquiry.phone || '-'}
Source page: ${enquiry.source_page}
UTM source: ${enquiry.utm_source || '-'}

Message:
${enquiry.message}

Received at: ${enquiry.received_at}
      `.trim();

      const htmlBody = `
        <h2>New Nsagu Industrial Park enquiry</h2>
        <p><strong>Name:</strong> ${enquiry.name}</p>
        <p><strong>Email:</strong> ${enquiry.email}</p>
        <p><strong>Organisation:</strong> ${enquiry.organisation || '-'}</p>
        <p><strong>Role:</strong> ${enquiry.role}</p>
        <p><strong>Phone:</strong> ${enquiry.phone || '-'}</p>
        <p><strong>Source page:</strong> ${enquiry.source_page}</p>
        <p><strong>UTM source:</strong> ${enquiry.utm_source || '-'}</p>
        <p><strong>Message:</strong></p>
        <p>${enquiry.message.replace(/\n/g, '<br />')}</p>
        <p><em>Received at: ${enquiry.received_at}</em></p>
      `;

      try {
        const emailResult = await resend.emails.send({
          from: fromAddress,
          to: toAddress,
          subject,
          text: textBody,
          html: htmlBody
        });
        console.log('Resend email result:', emailResult);
      } catch (emailErr) {
        console.error('Error sending enquiry email:', emailErr);
        // We still respond ok so the user isn't blocked
      }
    }

    // Response to browser
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
