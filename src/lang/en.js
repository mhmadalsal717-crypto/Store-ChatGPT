// ============================================================
//  English — every string the customer sees
//  Keys grouped by screen. See README.md in this folder.
// ============================================================
export default {

  // ---------- Persistent menu ----------
  'menu.products': '🛒 Products',
  'menu.profile':  '👤 My Profile',
  'menu.invites':  '🎁 Referrals',
  'menu.voucher':  '💳 Redeem Code',
  'menu.topup':    '💰 Add Funds',
  'menu.help':     '❓ Support',
  'menu.policy':   '🛡 Bot Policy',
  'menu.admin':    '⚙️ Admin Panel',

  // ---------- Common buttons ----------
  'btn.close':     '✖️ Close',
  'btn.back':      '« Back',
  'btn.services':  '« Services',
  'btn.plans':     '« Back to plans',
  'btn.prev':      '‹ Prev',
  'btn.next':      'Next ›',
  'btn.cancel':    '« Cancel',

  // ---------- Store ----------
  'shop.pick':      'Choose the service you want:',
  'shop.empty':     '📭 The catalog is empty right now.',
  'shop.available': '🟢 What is available',
  'shop.plans':     '{emoji} Choose the <b>{provider}</b> plan you want to activate:',
  'shop.noPlans':   '📭 No plans available in this section.',
  'shop.gone':      '❌ This product is no longer available.',

  'shop.avail.title': '🟢 <b>Available now</b> · {count} products',
  'shop.avail.none':  '🟢 <b>Available now</b>\n\n📭 Nothing in stock right now. Check back soon.',

  // ---------- Product page ----------
  'item.duration':  '⏳ Duration: <b>{days}</b> days',
  'item.warranty':  '🛡 Warranty: <b>{days}</b> days',
  'item.delivery':  '📥 Delivery: {type} · instant',
  'item.instr':     'Important instructions',
  'item.buy':       '🛒 Buy',
  'item.inStock':   '🟢 In stock',
  'item.low':       '🟡 Only {n} left',
  'item.out':       '🔴 Out of stock',

  // ---------- Purchase confirmation ----------
  'confirm.title':  '🧾 <b>Confirm purchase</b>',
  'confirm.price':  '💵 Price: <b>{price}</b>',
  'confirm.after':  '💰 Balance after purchase: <b>{balance}</b>',
  'confirm.short':  '❌ Not enough balance. You need <b>{missing}</b> more.',
  'confirm.yes':    '✅ Confirm purchase',
  'confirm.topup':  '💰 Add funds',

  // ---------- Order result ----------
  'order.working':  '⏳ Processing your order…',
  'order.done':     '✅ <b>Purchase complete</b>',
  'order.pending':  '⏳ <b>Your order is being processed</b>\nYou will get it as soon as it is ready. No need to order again.',
  'order.failed':   '❌ <b>Order failed</b>\n{reason}',
  'order.refunded': '↩️ We refunded <b>{amount}</b> to your wallet.',
  'order.maint':    'The provider is under maintenance. Try again shortly — you were not charged.',
  'order.noStock':  'This product is out of stock.',
  'order.paused':   'Sales are paused on this product.',
  'order.badQty':   'Invalid quantity.',

  // ---------- Delivery ----------
  'deliv.link':     '🔗 Activation link',
  'deliv.code':     '🎟 Code',
  'deliv.account':  '🔐 Account details',
  'deliv.warn':     '⚠️ Keep this somewhere safe — we cannot show it again.',

  // ---------- System ----------
  'sys.maintenance': '🛠 The bot is under maintenance. Try again shortly.',
  'sys.banned':      '🚫 Your account is banned.',
  'sys.error':       '⚠️ Something went wrong. Please try again.',
  'sys.loading':     '⏳ One moment…',

  // ---------- Language ----------
  'lang.title':    '🌐 <b>Language</b>',
  'lang.pick':     'Choose your language:',
  'lang.current':  'Current language: <b>English</b>',
  'lang.done':     '✅ Language changed to English.',
  'lang.ar':       '🇸🇦 العربية',
  'lang.en':       '🇬🇧 English',

  // ---------- Join gate ----------
  'join.text':    'Welcome! 👋\n\nTo use the bot and get services, you must first join our Telegram group and channel.\n\n👇 Tap the buttons below to join, then tap "Verify now".',
  'join.group':   '💬 Join the group',
  'join.channel': '📢 Join the channel',
  'join.verify':  '✅ Verify now',
  'join.missing': 'You have not joined everything yet. Join the group and channel, then try again.',

  // ---------- Referrals ----------
  'inv.menu':      'Choose one of the options below to get free invites and rewards.',
  'inv.btnLink':   '🔗 Invite link',
  'inv.btnStats':  '📊 Invite stats',
  'inv.btnClaim':  '💰 Claim my reward',

  'inv.linkTitle': '<blockquote>🔗 Your invite link:</blockquote>',
  'inv.linkPitch': '<i>Share this link with your friends and earn ${reward} for every {per} people who join and activate the bot! 🎉</i>',
  'inv.rules':     '⚠️ <b>Important — please read carefully</b>\nShare your referral link responsibly and follow these rules:\n💥 Up to {daily} valid invites per day.\n💥 Up to {total} valid invites per account in total.\n💥 Only real users who join and activate the bot are counted.\n💥 The system automatically reviews all referrals and detects suspicious activity.\n\n🚫 <b>Fake invites are strictly forbidden.</b>\nThis includes but is not limited to:\n• Creating fake accounts.\n• Inviting yourself using multiple accounts.\n• Using fake numbers or temporary accounts.\n• Using bots, scripts or automated methods.\n• Any attempt to manipulate or abuse the referral system.\n\n⚠️ If you add fake users or try to exploit the program, your account may be flagged automatically. As a result:\n❌ Fake invites will be removed.\n❌ Rewards may be cancelled.\n❌ Your access to referrals may be restricted.\n❌ Your account may be banned temporarily or permanently.\n\n🚫 <b>Automatic ban notice</b>\nIf suspicious activity is detected your account may be banned automatically. If you believe this was a mistake, contact support with proof of where and how you shared your link.\n📧 Support: {support}\n\nThank you for helping us keep referrals fair and safe for everyone. 🤝',

  'inv.statsTitle': '<blockquote>📊 Your referral stats:</blockquote>',
  'inv.stTotal':    '👥 Total registered: <b>{n}</b>',
  'inv.stJoin':     '🕐 Awaiting join (group + channel): <b>{n}</b>',
  'inv.stHuman':    '🤖 Awaiting human verification: <b>{n}</b>',
  'inv.stActive':   '📱 Awaiting bot interaction: <b>{n}</b>',
  'inv.stReady':    '✅ Eligible for payout: <b>{n}</b>',
  'inv.stPaid':     '🎊 Invites already rewarded: <b>{n}</b>',
  'inv.stEarned':   '🎉 Total earned: <b>{amount}</b>',
  'inv.stFoot':     '📌 Every <b>{per}</b> eligible invites = <b>${reward}</b>.',

  'inv.claimOk':    '🎉 Paid <b>{amount}</b> for <b>{n}</b> eligible invites.\nYour balance is now <b>{balance}</b>',
  'inv.claimNone':  'Not there yet. You need <b>{need}</b> more eligible invites.',

  // ---------- Human check ----------
  'hv.title':  '🤖 <b>Quick check</b>\n\nTap the number <b>{n}</b> below:',
  'hv.wrong':  'Wrong. Try again.',

  // ---------- Bot commands ----------
  'cmd.start':     'Main menu',
  'cmd.menu':      'Open menu',
  'cmd.lang':      'Change language · تغيير اللغة',
};
