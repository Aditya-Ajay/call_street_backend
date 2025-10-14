/**
 * Seed Posts Data
 * Creates sample analyst users and posts for development/testing
 */

const { pool } = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function seedData() {
  try {
    console.log('🌱 Starting seed process...\n');

    // 0. Clean up existing data
    console.log('Cleaning up existing seed data...');
    await pool.query(`DELETE FROM analyst_profiles WHERE sebi_number IN ('INZ000123456', 'INZ000654321')`);
    await pool.query(`DELETE FROM posts WHERE analyst_id IN (SELECT id FROM users WHERE email IN ('analyst@example.com', 'priya@example.com'))`);
    await pool.query(`DELETE FROM users WHERE email IN ('analyst@example.com', 'priya@example.com', 'trader@example.com')`);
    console.log('✅ Cleanup complete');

    // 1. Create sample analyst user
    console.log('\nCreating sample analyst...');
    const passwordHash = await bcrypt.hash('password123', 10);

    const analystResult = await pool.query(
      `INSERT INTO users (
        email, phone, password_hash, user_type,
        email_verified, phone_verified, is_active
      ) VALUES ($1, $2, $3, $4, true, true, true)
      RETURNING id, email`,
      [
        'analyst@example.com',
        '+919876543210',
        passwordHash,
        'analyst'
      ]
    );

    const analystId = analystResult.rows[0].id;
    console.log('✅ Analyst created:', analystResult.rows[0].email);

    // 2. Create analyst profile with rich data
    console.log('\nCreating analyst profile...');
    const profileResult = await pool.query(
      `INSERT INTO analyst_profiles (
        user_id, display_name, bio, sebi_number,
        verification_status, specializations, languages,
        photo_url, avg_rating, total_reviews,
        active_subscribers, total_subscribers, total_posts,
        monthly_revenue, commission_rate, is_featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id`,
      [
        analystId,
        'Rajesh Kumar',
        'SEBI Registered Research Analyst with 8+ years of experience in Indian equity markets. Specialized in technical analysis, swing trading, and options strategies. Track record of consistent returns with 70%+ accuracy. Featured analyst on major financial platforms.',
        'INZ000123456',
        'approved',
        ['Technical Analysis', 'Swing Trading', 'Options Trading', 'Mid Cap Stocks'],
        ['English', 'Hindi', 'Hinglish'],
        'https://ui-avatars.com/api/?name=Rajesh+Kumar&size=200&background=0D8ABC&color=fff',
        4.5, // avg_rating
        47, // total_reviews
        234, // active_subscribers
        250, // total_subscribers (must be >= active_subscribers)
        142, // total_posts
        45000, // monthly_revenue (in paisa = ₹450)
        0.20, // commission_rate
        true // is_featured
      ]
    );
    const profileId = profileResult.rows[0].id;
    console.log('✅ Analyst profile created with ID:', profileId);

    // 3. Create sample posts (varied and comprehensive)
    console.log('\nCreating sample posts...');

    const posts = [
      // TODAY'S URGENT INTRADAY CALLS
      {
        title: '🔥 URGENT: TATASTEEL - Intraday Breakout',
        content: '⚡ **TATA STEEL - IMMEDIATE ACTION REQUIRED**\n\n📊 **Breakout Alert:**\n- Breaking above 135 with heavy volume\n- Strong momentum candle\n- All indicators aligned\n\n💰 **Intraday Trade:**\n- Entry: 135-136 (NOW)\n- Target 1: 138.50\n- Target 2: 140\n- Stop Loss: 133.50\n\n⏰ **EXIT BY 3:15 PM TODAY**\n\nRisk-Reward: 1:2.5 ✅\n\n#TATASTEEL #Intraday #Urgent',
        post_type: 'call',
        strategy_type: 'intraday',
        stock_symbol: 'TATASTEEL',
        action: 'BUY',
        audience: 'free',
        is_urgent: true,
        entry_price: 135,
        target_price: 138.5,
        stop_loss: 133.5
      },
      {
        title: '🚨 URGENT: BANKNIFTY - Intraday Reversal',
        content: '⚠️ **BANK NIFTY - QUICK REVERSAL TRADE**\n\n📊 **Setup:**\n- Rejected from 44,500 resistance\n- Forming bearish engulfing\n- Sell signal on 15-min chart\n\n💰 **Intraday:**\n- Entry: 44,400-44,450 (SHORT)\n- Target: 44,150\n- SL: 44,600\n\n⏰ Exit by 3:00 PM\n\n#BankNifty #Intraday #Options',
        post_type: 'call',
        strategy_type: 'intraday',
        stock_symbol: 'BANKNIFTY',
        action: 'SELL',
        audience: 'paid',
        is_urgent: true,
        entry_price: 44400,
        target_price: 44150,
        stop_loss: 44600
      },
      {
        title: 'ICICIBANK - Intraday Scalp',
        content: '⚡ **ICICI BANK - Quick Scalp**\n\n📊 **15-min Chart:**\n- Support at 950\n- Buying pressure building\n- Good R:R setup\n\n💰 **Intraday Trade:**\n- Entry: 950-952\n- Target: 960\n- SL: 946\n\n⏰ Book profit by 2:30 PM\n\n#ICICIBANK #Scalping',
        post_type: 'call',
        strategy_type: 'intraday',
        stock_symbol: 'ICICIBANK',
        action: 'BUY',
        audience: 'free',
        is_urgent: false,
        entry_price: 950,
        target_price: 960,
        stop_loss: 946
      },

      // SWING TRADES
      {
        title: 'RELIANCE - Bullish Breakout Setup',
        content: '🎯 **RELIANCE INDUSTRIES** showing strong bullish momentum!\n\n📊 **Technical Analysis:**\n- Breaking above 2,450 resistance\n- Volume confirming the move\n- RSI at 65 - room to move up\n- MACD crossover bullish\n\n💰 **Swing Trade Setup:**\n- Entry: 2,450-2,460\n- Target 1: 2,520 (3%)\n- Target 2: 2,580 (5%)\n- Stop Loss: 2,400\n\n⏰ Time Frame: 5-7 days\n\n**Risk-Reward:** 1:3 ✅\n\n#RELIANCE #StockMarket #SwingTrading',
        post_type: 'call',
        strategy_type: 'swing',
        stock_symbol: 'RELIANCE',
        action: 'BUY',
        audience: 'free',
        entry_price: 2450,
        target_price: 2520,
        stop_loss: 2400
      },
      {
        title: 'TCS - Premium Swing Call',
        content: '🔥 **TCS - High Conviction Swing Trade**\n\n📊 **Multi-Timeframe Analysis:**\n- Daily chart showing bullish flag breakout\n- Weekly chart in strong uptrend\n- Volume profile supporting upside\n- All moving averages bullish\n\n💰 **Premium Setup:**\n- Entry Zone: 3,520-3,530\n- Target 1: 3,650 (3.5%)\n- Target 2: 3,750 (6.5%)\n- Stop Loss: 3,480\n\n⏰ Holding Period: 2-3 weeks\n\n**Risk-Reward:** 1:3.5 ✅\n\n⚠️ Premium subscribers only\n\n#TCS #IT #SwingTrading',
        post_type: 'call',
        strategy_type: 'swing',
        stock_symbol: 'TCS',
        action: 'BUY',
        audience: 'paid',
        entry_price: 3520,
        target_price: 3650,
        stop_loss: 3480
      },
      {
        title: 'BAJAJFINSV - Swing Opportunity',
        content: '💎 **BAJAJ FINSERV - Strong Setup**\n\n📊 **Technical:**\n- Consolidation breakout\n- Good volume\n- Fibonacci retracement complete\n\n💰 **Swing Trade:**\n- Entry: 1,580-1,590\n- Target 1: 1,650\n- Target 2: 1,720\n- SL: 1,540\n\n⏰ 2-3 weeks\n\n#BAJAJFINSV #Finance',
        post_type: 'call',
        strategy_type: 'swing',
        stock_symbol: 'BAJAJFINSV',
        action: 'BUY',
        audience: 'paid',
        entry_price: 1580,
        target_price: 1650,
        stop_loss: 1540
      },

      // LONG TERM
      {
        title: 'HDFC Bank - Long Term Investment',
        content: '🏦 **HDFC BANK - Long Term Opportunity**\n\n📊 **Fundamental Analysis:**\n- Strong fundamentals with consistent growth\n- Market leader in retail banking\n- NPA levels under control\n- Good dividend yield\n\n💰 **For Long-term Investors:**\n- Accumulation Zone: Below 1,600\n- Target: 1,850 (6-12 months)\n- Strategy: Add on dips\n\n**Investment Thesis:**\nOne of the best banking stocks for long-term wealth creation. Current price offers good entry for patient investors.\n\n*Not a trading call - for long-term portfolio building*\n\n#HDFCBANK #Investing #Banking #Wealth',
        post_type: 'commentary',
        strategy_type: 'long_term',
        audience: 'free'
      },

      // MARKET COMMENTARY
      {
        title: '📊 Market Analysis - Nifty 50 Update',
        content: '📈 **NIFTY 50 Daily Update**\n\n**Current Status:**\n- Trading Range: 19,200 - 19,500\n- Market showing consolidation after recent rally\n- Reduced volumes indicating sideways movement\n\n**Key Levels:**\n- Support: 19,200 (Strong)\n- Resistance: 19,500 (Immediate)\n- Breakout above 19,500 = Target 19,800\n- Break below 19,200 = Target 19,000\n\n**Outlook:**\nExpect sideways to slightly bullish movement this week. Good time for stock-specific swing trades rather than index trading.\n\n**Sectors to Watch:**\n- IT: Showing strength\n- Banking: Consolidating\n- Auto: Weak momentum\n\n#Nifty #MarketAnalysis #IndianMarket',
        post_type: 'commentary',
        audience: 'free'
      },
      {
        title: '🎯 Weekly Market Outlook',
        content: '📅 **WEEKLY MARKET PREVIEW**\n\n**Last Week:**\n- Nifty +1.2%\n- Bank Nifty +0.8%\n- Mid Cap outperformed\n\n**This Week:**\n- RBI Policy announcement (Watch)\n- IT earnings season begins\n- FII/DII data mixed\n\n**Strategy:**\nFocus on stock-specific opportunities. Avoid aggressive positions before RBI policy.\n\n#WeeklyOutlook #Strategy',
        post_type: 'commentary',
        audience: 'free'
      },

      // OPTIONS TRADING
      {
        title: '🎯 NIFTY Options - Weekly Expiry Strategy',
        content: '📊 **NIFTY WEEKLY OPTIONS STRATEGY**\n\n**Setup:**\n- Current: 19,350\n- Expected Range: 19,200-19,500\n\n💰 **Iron Condor Setup:**\n- Sell 19,500 CE\n- Buy 19,600 CE\n- Sell 19,200 PE\n- Buy 19,100 PE\n\n**Max Profit:** ₹8,000 per lot\n**Max Risk:** ₹17,000 per lot\n\n⚠️ Advanced strategy - Premium members only\n\n#NiftyOptions #IronCondor',
        post_type: 'commentary', // Changed from 'call' since it's a strategy discussion
        strategy_type: 'options',
        stock_symbol: 'NIFTY',
        audience: 'paid',
        is_urgent: false
      },

      // EDUCATIONAL CONTENT
      {
        title: '📚 Risk Management Tips',
        content: '💡 **Risk Management Essentials**\n\n1. Never risk more than 2% per trade\n2. Always use stop loss\n3. Don\'t average losing positions\n4. Book partial profits at targets\n5. Keep trading journal\n\n**Remember:** Preservation of capital is more important than profits!\n\n#Education #RiskManagement #Trading101',
        post_type: 'commentary', // Changed from 'education' to 'commentary'
        audience: 'free'
      },

      // PROFIT BOOKING
      {
        title: '✅ Target Hit: INFY - Book Profits',
        content: '🎉 **INFOSYS - TARGET ACHIEVED**\n\n**Entry:** 1,435\n**Exit:** 1,445\n**Profit:** +10 points (0.7%)\n\n⏰ Intraday call closed successfully in 2 hours!\n\n**Result:** ✅ PROFIT\n\nCongratulations to all who followed! 🎯\n\n#INFY #TargetHit #Profit',
        post_type: 'update', // Changed from 'result' to 'update'
        strategy_type: 'intraday',
        stock_symbol: 'INFY',
        action: 'BUY',
        audience: 'free',
        entry_price: 1435,
        target_price: 1445,
        stop_loss: 1428
      }
    ];

    for (const post of posts) {
      await pool.query(
        `INSERT INTO posts (
          analyst_id, title, content, post_type, strategy_type,
          stock_symbol, action, audience, is_urgent, entry_price,
          target_price, stop_loss, views_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          analystId,
          post.title,
          post.content,
          post.post_type,
          post.strategy_type || null,
          post.stock_symbol || null,
          post.action || null,
          post.audience,
          post.is_urgent || false,
          post.entry_price || null,
          post.target_price || null,
          post.stop_loss || null,
          Math.floor(Math.random() * 200)  // Random views
        ]
      );
      console.log(`✅ Created post: ${post.title}`);
    }

    // 4. Create second analyst user
    console.log('\nCreating second analyst...');
    const analyst2Result = await pool.query(
      `INSERT INTO users (
        email, phone, password_hash, user_type,
        email_verified, phone_verified, is_active
      ) VALUES ($1, $2, $3, $4, true, true, true)
      ON CONFLICT (email) DO UPDATE
      SET user_type = 'analyst'
      RETURNING id, email`,
      [
        'priya@example.com',
        '+919876543212',
        passwordHash,
        'analyst'
      ]
    );

    const analyst2Id = analyst2Result.rows[0].id;
    console.log('✅ Second analyst created:', analyst2Result.rows[0].email);

    // Create second analyst profile
    const profile2Result = await pool.query(
      `INSERT INTO analyst_profiles (
        user_id, display_name, bio, sebi_number,
        verification_status, specializations, languages,
        photo_url, avg_rating, total_reviews,
        active_subscribers, total_subscribers, total_posts,
        monthly_revenue, is_featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        analyst2Id,
        'Priya Sharma',
        'Options trading specialist with expertise in Bank Nifty & Nifty strategies. 5 years experience in derivatives markets. Known for high-accuracy weekly option calls and comprehensive market analysis.',
        'INZ000654321',
        'approved',
        ['Options Trading', 'Bank Nifty', 'Intraday', 'Derivatives'],
        ['English', 'Hindi'],
        'https://ui-avatars.com/api/?name=Priya+Sharma&size=200&background=7C3AED&color=fff',
        4.7, // avg_rating
        32, // total_reviews
        156, // active_subscribers
        180, // total_subscribers (must be >= active_subscribers)
        87, // total_posts
        28000, // monthly_revenue
        false // is_featured
      ]
    );
    const profile2Id = profile2Result.rows[0].id;
    console.log('✅ Second analyst profile created with ID:', profile2Id);

    // 4.5. Create posts for second analyst (Priya Sharma - Options Specialist)
    console.log('\nCreating posts for second analyst...');

    const analyst2Posts = [
      {
        title: '🔥 URGENT: BANKNIFTY Options - Premium Call',
        content: '⚡ **BANK NIFTY WEEKLY OPTIONS - ACT NOW**\n\n📊 **Setup:**\n- Spot: 44,350\n- Bullish momentum building\n- Break above 44,400 expected\n\n💰 **Call Option:**\n- Strike: 44,500 CE\n- Entry: ₹150-160\n- Target: ₹250\n- SL: ₹100\n\n⏰ **Expiry:** This Thursday\n**Time:** Close by 3:00 PM today\n\n⚠️ High risk, position size accordingly!\n\n#BankNifty #Options #WeeklyExpiry',
        post_type: 'call',
        strategy_type: 'options',
        stock_symbol: 'BANKNIFTY',
        action: 'BUY',
        audience: 'paid',
        is_urgent: true,
        entry_price: 150,
        target_price: 250,
        stop_loss: 100
      },
      {
        title: 'NIFTY Straddle Setup - Weekly Expiry',
        content: '📊 **NIFTY WEEKLY STRADDLE**\n\n**Current:** 19,350\n\n💰 **Setup:**\n- Buy 19,350 CE @ ₹80\n- Buy 19,350 PE @ ₹75\n- Total Cost: ₹155\n\n**Breakeven:**\n- Upper: 19,505\n- Lower: 19,195\n\n⏰ Hold till Wednesday\n\nExpecting big move in either direction!\n\n#Nifty #Straddle #Volatility',
        post_type: 'call',
        strategy_type: 'options',
        stock_symbol: 'NIFTY',
        action: 'BUY',
        audience: 'paid',
        is_urgent: false,
        entry_price: 155,
        target_price: 250,
        stop_loss: 100
      },
      {
        title: '📚 Options Basics - What is Delta?',
        content: '💡 **Understanding Options Delta**\n\n**Delta** measures how much an option price moves for ₹1 move in underlying.\n\n**Call Options:**\n- ATM: ~0.5 delta\n- ITM: 0.7-0.9 delta\n- OTM: 0.1-0.3 delta\n\n**Put Options:**\n- Negative delta\n- -0.5 for ATM\n\n**Practical Use:**\nHigher delta = More sensitive to price movement\n\nPerfect for directional trades!\n\n#OptionsEducation #Greeks #Delta',
        post_type: 'commentary', // Changed from 'education' to 'commentary'
        audience: 'free'
      },
      {
        title: 'Bank Nifty - Daily Analysis',
        content: '📈 **BANK NIFTY DAILY UPDATE**\n\n**Today\'s Range:** 44,200 - 44,600\n\n**Key Levels:**\n- Support: 44,200 (Strong)\n- Resistance: 44,600\n\n**Options Strategy:**\nSell 44,700 CE and 44,100 PE for range-bound play.\n\n**Outlook:** Consolidation expected\n\n#BankNifty #DailyAnalysis',
        post_type: 'commentary',
        audience: 'free'
      },
      {
        title: '✅ BANKNIFTY 44500 CE - Target Hit!',
        content: '🎉 **BANK NIFTY OPTIONS - PROFIT BOOKED**\n\n**Entry:** ₹150\n**Exit:** ₹245\n**Profit:** ₹95 (63% gain!)\n\n⏰ Closed in just 3 hours\n\n**Result:** ✅ PROFIT\n\nCongrats to all premium members! 🎯💰\n\n#BankNifty #OptionsTrading #TargetHit',
        post_type: 'update', // Changed from 'result' to 'update'
        strategy_type: 'options',
        stock_symbol: 'BANKNIFTY',
        action: 'BUY',
        audience: 'paid',
        entry_price: 150,
        target_price: 245,
        stop_loss: 100
      },
      {
        title: 'Weekly Options Expiry Strategy',
        content: '📅 **WEEKLY EXPIRY GAME PLAN**\n\n**This Week:**\n- High volatility expected\n- RBI announcement pending\n- Use spreads over naked options\n\n**Recommended:**\n1. Bull Call Spread on Nifty\n2. Iron Condor on Bank Nifty\n3. Avoid selling premium before event\n\n**Risk Management:** Keep positions small!\n\n#WeeklyExpiry #Strategy',
        post_type: 'commentary',
        audience: 'paid'
      }
    ];

    for (const post of analyst2Posts) {
      await pool.query(
        `INSERT INTO posts (
          analyst_id, title, content, post_type, strategy_type,
          stock_symbol, action, audience, is_urgent, entry_price,
          target_price, stop_loss, views_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          analyst2Id,
          post.title,
          post.content,
          post.post_type,
          post.strategy_type || null,
          post.stock_symbol || null,
          post.action || null,
          post.audience,
          post.is_urgent || false,
          post.entry_price || null,
          post.target_price || null,
          post.stop_loss || null,
          Math.floor(Math.random() * 150)  // Random views
        ]
      );
      console.log(`✅ Created post for analyst 2: ${post.title}`);
    }

    // 5. Create pricing tiers for analysts
    console.log('\nCreating pricing tiers for analysts...');

    // Tiers for Analyst 1 (Rajesh Kumar)
    const analyst1Tiers = [
      {
        analyst_id: analystId,
        tier_name: 'Free',
        tier_description: 'Access to free market analysis and basic calls',
        tier_order: 1,
        price_monthly: 0,
        price_yearly: null, // NULL for free tier to pass constraint
        features: ['Daily market commentary', 'Free stock calls', 'Weekly market analysis'],
        posts_per_day: 2,
        chat_access: false,
        priority_support: false,
        is_free_tier: true
      },
      {
        analyst_id: analystId,
        tier_name: 'Premium',
        tier_description: 'Premium calls with detailed analysis and chat support',
        tier_order: 2,
        price_monthly: 99900, // ₹999 in paisa
        price_yearly: 999900, // ₹9,999 in paisa (2 months free)
        features: ['All free features', 'Premium stock calls', 'Intraday & swing trades', 'Group chat access', 'Entry/Exit/SL levels'],
        posts_per_day: 10,
        chat_access: true,
        priority_support: false,
        is_free_tier: false
      },
      {
        analyst_id: analystId,
        tier_name: 'Pro',
        tier_description: 'Complete access with 1-on-1 support and priority assistance',
        tier_order: 3,
        price_monthly: 249900, // ₹2,499 in paisa
        price_yearly: 2499000, // ₹24,990 in paisa (2 months free)
        features: ['All premium features', 'Unlimited calls', 'Options strategies', '1-on-1 chat support', 'Priority alerts', 'Portfolio review'],
        posts_per_day: null, // Unlimited
        chat_access: true,
        priority_support: true,
        is_free_tier: false
      }
    ];

    // Tiers for Analyst 2 (Priya Sharma)
    const analyst2Tiers = [
      {
        analyst_id: analyst2Id,
        tier_name: 'Free',
        tier_description: 'Free options insights and weekly calls',
        tier_order: 1,
        price_monthly: 0,
        price_yearly: null, // NULL for free tier to pass constraint
        features: ['Weekly options analysis', 'Free Bank Nifty calls', 'Market updates'],
        posts_per_day: 1,
        chat_access: false,
        priority_support: false,
        is_free_tier: true
      },
      {
        analyst_id: analyst2Id,
        tier_name: 'Premium',
        tier_description: 'Daily options calls with strike selection and timing',
        tier_order: 2,
        price_monthly: 149900, // ₹1,499 in paisa
        price_yearly: 1499000, // ₹14,990 in paisa (2 months free)
        features: ['All free features', 'Daily Bank Nifty calls', 'Nifty options', 'Strike selection', 'Entry timing', 'Group chat'],
        posts_per_day: 8,
        chat_access: true,
        priority_support: false,
        is_free_tier: false
      }
    ];

    // Insert tiers for both analysts
    for (const tier of [...analyst1Tiers, ...analyst2Tiers]) {
      await pool.query(
        `INSERT INTO subscription_tiers (
          analyst_id, tier_name, tier_description, tier_order,
          price_monthly, price_yearly, features,
          posts_per_day, chat_access, priority_support, is_free_tier
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (analyst_id, tier_name) DO UPDATE
        SET tier_description = EXCLUDED.tier_description,
            price_monthly = EXCLUDED.price_monthly,
            price_yearly = EXCLUDED.price_yearly,
            features = EXCLUDED.features`,
        [
          tier.analyst_id,
          tier.tier_name,
          tier.tier_description,
          tier.tier_order,
          tier.price_monthly,
          tier.price_yearly,
          JSON.stringify(tier.features),
          tier.posts_per_day,
          tier.chat_access,
          tier.priority_support,
          tier.is_free_tier
        ]
      );
      console.log(`✅ Created tier: ${tier.tier_name} for analyst`);
    }

    // 6. Create a sample trader user
    console.log('\nCreating sample trader...');
    const traderResult = await pool.query(
      `INSERT INTO users (
        email, phone, password_hash, user_type,
        email_verified, phone_verified, is_active
      ) VALUES ($1, $2, $3, $4, true, true, true)
      ON CONFLICT (email) DO UPDATE
      SET user_type = 'trader'
      RETURNING id, email`,
      [
        'trader@example.com',
        '+919876543211',
        passwordHash,
        'trader'
      ]
    );
    console.log('✅ Trader created:', traderResult.rows[0].email);

    console.log('\n🎉 Seed data created successfully!');
    console.log('\n📝 Test Credentials:');
    console.log('   Analyst 1: analyst@example.com / password123');
    console.log('   Analyst 2: priya@example.com / password123');
    console.log('   Trader: trader@example.com / password123');
    console.log('   OTP (dev): 123456');
    console.log('\n📊 Test Endpoints:');
    console.log(`   Profile: curl http://localhost:8080/api/analysts/profile/${profileId}`);
    console.log(`   Tiers:   curl http://localhost:8080/api/subscriptions/tiers/${profileId}`);
    console.log('');

  } catch (error) {
    console.error('❌ Seed error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run seed
seedData();
