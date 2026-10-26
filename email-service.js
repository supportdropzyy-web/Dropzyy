const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Nodemailer SMTP Transporter Configuration
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'supportdropzyy@gmail.com';
const SENDER_PASSWORD = process.env.SENDER_PASSWORD || 'reoovuigihzuepcn';

const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: SENDER_EMAIL.trim(),
        pass: SENDER_PASSWORD.trim()
    }
});

// Verify Nodemailer transporter connection on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('❌ [NODEMAILER ERROR] Transporter connection failed:', error.message);
    } else {
        console.log(`⚡ [NODEMAILER SUCCESS] Connected to Gmail SMTP as ${SENDER_EMAIL}`);
    }
});

// API Endpoint to Send Email via Nodemailer
app.post('/api/nodemailer/send', async (req, res) => {
    const { to, subject, html, attachments } = req.body;

    if (!to || !to.includes('@')) {
        return res.status(400).json({ success: false, error: 'Valid recipient email required' });
    }

    try {
        const mailOptions = {
            from: `"Dropzyy Instant Delivery" <${SENDER_EMAIL}>`,
            to: to.trim(),
            subject: subject || 'Notification from Dropzyy',
            html: html || '<p>Thank you for using Dropzyy!</p>',
            attachments: attachments || []
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`[NODEMAILER DELIVERED] Email sent to ${to} (Message ID: ${info.messageId})`);
        res.json({ success: true, messageId: info.messageId, recipient: to });
    } catch (error) {
        console.error(`[NODEMAILER FAIL] Failed to send email to ${to}:`, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.NODEMAILER_PORT || process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Dropzyy Nodemailer Mail Service running on port ${PORT}`);
});
