// Load .env file only if it exists (for local development)
// On Render, environment variables are set in the dashboard
require('dotenv').config();

console.log('='.repeat(50));
console.log('🚀 بدء تشغيل سيرفر البوت...');
console.log('='.repeat(50));

// Check BOT_TOKEN (works with both .env file and Render environment variables)
if (!process.env.BOT_TOKEN) {
  console.error('\n❌❌❌ خطأ: BOT_TOKEN غير موجود!');
  console.error('📝 أضف BOT_TOKEN في:');
  console.error('   - ملف .env (للتطوير المحلي)');
  console.error('   - أو في Render Dashboard > Environment Variables');
  console.error('');
  process.exit(1);
}

console.log('✅ BOT_TOKEN موجود');
console.log(`📡 Port: ${process.env.PORT || 3000}`);
console.log(`🔗 Webhook URL: ${process.env.WEBHOOK_URL || 'غير مضبوط (سيستخدم polling)'}\n`);

const express = require('express');
const bot = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

// Webhook endpoint for Telegram (must use raw body parser for webhook)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    console.log('\n📨📨📨 Received webhook request 📨📨📨');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body length:', req.body?.length || 0);
    
    if (!req.body || req.body.length === 0) {
      console.log('⚠️ Empty body, returning OK');
      return res.status(200).send('OK');
    }
    
    const update = JSON.parse(req.body);
    
    // Log update type
    let updateType = 'unknown';
    if (update.message) {
      updateType = update.message.successful_payment ? 'successful_payment' : 
                   update.message.text ? 'text_message' : 'message';
      console.log(`📨 Update type: ${updateType}`);
      if (update.message.text) {
        console.log(`📝 Message text: ${update.message.text}`);
      }
      if (update.message.successful_payment) {
        console.log(`💳 Payment received: ${update.message.successful_payment.total_amount} ${update.message.successful_payment.currency}`);
      }
    } else if (update.callback_query) {
      updateType = 'callback_query';
      console.log(`🔘 Callback query: ${update.callback_query.data}`);
    }
    
    await bot.handleUpdate(update);
    res.status(200).send('OK');
    console.log(`✅ Webhook processed successfully (${updateType})`);
  } catch (error) {
    console.error('\n❌❌❌ Error processing webhook ❌❌❌');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    // Always return 200 to Telegram even on error
    res.status(200).send('OK');
  }
});

// ─── NOWPayments Webhook ─────────────────────────────────────
app.post('/nowpayments-webhook', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-nowpayments-sig'] || '';
    const body = req.body;
    console.log('💠 NOWPayments webhook received:', JSON.stringify(body));
    await bot.nowPaymentsWebhook(body, signature);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('NOWPayments webhook error:', err.message);
    res.status(200).json({ status: 'ok' });
  }
});

// Middleware to parse JSON (for other endpoints)
app.use(express.json());

// Health check endpoint (required for Render)
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Telegram Bot is running' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// If webhook URL is provided, set webhook on startup (for production)
// Otherwise, use polling (for local development)
if (process.env.WEBHOOK_URL) {
  const webhookUrl = `${process.env.WEBHOOK_URL}/webhook`;
  console.log(`🔗 Setting webhook to: ${webhookUrl}`);
  
  // First, delete any existing webhook
  bot.telegram.deleteWebhook({ drop_pending_updates: true })
    .then(() => {
      console.log('🗑️  Deleted existing webhook (if any)');
      // Wait a bit then set new webhook
      return new Promise(resolve => setTimeout(resolve, 1000));
    })
    .then(() => {
      console.log(`🔗 Setting webhook to: ${webhookUrl}`);
      return bot.telegram.setWebhook(webhookUrl);
    })
    .then(() => {
      console.log('✅ Webhook set successfully');
      // Verify webhook info
      return bot.telegram.getWebhookInfo();
    })
    .then((info) => {
      console.log('\n📊 Webhook Info:');
      console.log('   URL:', info.url);
      console.log('   Has custom certificate:', info.has_custom_certificate);
      console.log('   Pending updates:', info.pending_update_count);
      if (info.last_error_date) {
        console.log('   ⚠️ Last error date:', new Date(info.last_error_date * 1000).toISOString());
      }
      if (info.last_error_message) {
        console.log('   ⚠️ Last error message:', info.last_error_message);
      }
      console.log('');
    })
    .catch((err) => {
      console.error('❌ Error setting webhook:', err.message);
      console.error('Full error:', err);
    });
} else {
  // Use polling for local development
  console.log('🔄 بدء البوت باستخدام polling (وضع التطوير المحلي)...\n');
  
  bot.launch()
    .then(() => {
      console.log('='.repeat(50));
      console.log('✅✅✅ البوت يعمل الآن بنجاح! ✅✅✅');
      console.log('='.repeat(50));
      console.log('📱 جرب أرسل /start للبوت في تيليجرام\n');
      console.log('💡 لوقف البوت اضغط Ctrl+C\n');
    })
    .catch((err) => {
      console.error('\n' + '='.repeat(50));
      console.error('❌❌❌ خطأ في تشغيل البوت!');
      console.error('='.repeat(50));
      console.error('\n📋 تفاصيل الخطأ:');
      console.error(`الرسالة: ${err.message}`);
      console.error(`الكود: ${err.code || 'غير محدد'}`);
      console.error(`الوصف: ${err.description || 'غير محدد'}`);
      if (err.response) {
        console.error(`الاستجابة: ${JSON.stringify(err.response, null, 2)}`);
      }
      console.error('\n📝 تأكد من:');
      console.error('1. ✅ BOT_TOKEN صحيح في ملف .env (انسخه من @BotFather)');
      console.error('2. ✅ الاتصال بالإنترنت يعمل');
      console.error('3. ✅ البوت مفعّل من @BotFather');
      console.error('4. ✅ BOT_TOKEN لم ينتهي صلاحيته\n');
      console.error('🔍 الخطأ الكامل:');
      console.error(err);
      console.error('\n');
      process.exit(1);
    });

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
