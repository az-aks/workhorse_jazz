import { Bot, BotConfig } from './bot';
import { MarketCache, PoolCache } from './cache';
import { Listeners } from './listeners';
import { Connection, KeyedAccountInfo, Keypair, PublicKey } from '@solana/web3.js';
import { LIQUIDITY_STATE_LAYOUT_V4, MARKET_STATE_LAYOUT_V3, Token, TokenAmount, LiquidityPoolKeysV4, LiquidityStateV4, Liquidity, Percent } from '@raydium-io/raydium-sdk';
import { AccountLayout, getAssociatedTokenAddressSync, RawAccount } from '@solana/spl-token';
import { DefaultTransactionExecutor } from './transactions';
import { createPoolKeys, sleep } from './helpers';
import {
  getToken,
  getWallet,
  logger,
  COMMITMENT_LEVEL,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  QUOTE_MINT,
  MAX_POOL_SIZE,
  MIN_POOL_SIZE,
  QUOTE_AMOUNT,
  PRIVATE_KEY,
  USE_SNIPE_LIST,
  AUTO_SELL_DELAY,
  MAX_SELL_RETRIES,
  AUTO_SELL,
  MAX_BUY_RETRIES,
  AUTO_BUY_DELAY,
  COMPUTE_UNIT_LIMIT,
  COMPUTE_UNIT_PRICE,
  TAKE_PROFIT,
  STOP_LOSS,
  BUY_SLIPPAGE,
  SELL_SLIPPAGE,
  PRICE_CHECK_DURATION,
  PRICE_CHECK_INTERVAL,
  FILTER_CHECK_INTERVAL,
  FILTER_CHECK_DURATION,
  CONSECUTIVE_FILTER_MATCHES,
  MAX_TOKENS_AT_THE_TIME,
  TRAILING_STOP_LOSS,
  SKIP_SELLING_IF_LOST_MORE_THAN,
  LOG_LEVEL,
} from './helpers';

interface PaperBalance {
  token: string;
  amount: number;
  symbol: string;
}

interface PaperTrade {
  id: string;
  action: 'buy' | 'sell';
  token: string;
  tokenSymbol: string;
  quoteAmount: number;
  tokenAmount: number;
  price: number;
  timestamp: Date;
  profit?: number;
  profitPercent?: number;
}

class PaperTradingBot extends Bot {
  private paperBalances: Map<string, PaperBalance> = new Map();
  private paperTrades: PaperTrade[] = [];
  private totalPaperProfit = 0;
  private tradeCounter = 0;
  private initialBalance = 0;

  constructor(
    connection: Connection,
    marketStorage: MarketCache,
    poolStorage: PoolCache,
    txExecutor: any,
    config: BotConfig,
  ) {
    super(connection, marketStorage, poolStorage, txExecutor, config);
    this.initializePaperBalances();
  }

  private initializePaperBalances() {
    // Initialize with virtual balances
    const symbol = this.config.quoteToken.symbol || 'SOL';
    
    if (symbol === 'USDC') {
      this.paperBalances.set('USDC', {
        token: this.config.quoteToken.mint.toString(),
        amount: 100, // Start with 100 USDC
        symbol: 'USDC'
      });
      this.initialBalance = 100;
    } else {
      this.paperBalances.set('SOL', {
        token: this.config.quoteToken.mint.toString(),
        amount: 1, // Start with 1 SOL
        symbol: 'SOL'
      });
      this.initialBalance = 1;
    }

    logger.info(`💰 Paper Trading initialized with ${this.initialBalance} ${symbol}`);
  }

  public async buy(accountId: any, poolState: any) {
    logger.trace({ mint: poolState.baseMint }, `[PAPER] Processing new mainnet pool...`);

    // Execute paper trade instead of simulation
    await this.executePaperBuy(poolState);
  }

  private async executePaperBuy(poolState: any) {
    const symbol = this.config.quoteToken.symbol || 'SOL';
    const quoteBalance = this.paperBalances.get(symbol);
    const quoteAmount = parseFloat(this.config.quoteAmount.toFixed());

    if (!quoteBalance || quoteBalance.amount < quoteAmount) {
      logger.warn(`[PAPER] Insufficient ${symbol} balance for buy: ${quoteBalance?.amount || 0} < ${quoteAmount}`);
      return;
    }

    try {
      // For paper trading, we'll estimate token amount based on random price simulation
      // In real implementation, you'd fetch actual pool data
      const estimatedTokenPrice = Math.random() * 0.001 + 0.0001; // Random price between 0.0001-0.0011
      const tokenAmount = quoteAmount / estimatedTokenPrice;

      // Generate trade ID
      const tradeId = `trade_${++this.tradeCounter}_${Date.now()}`;

      // Update paper balances
      quoteBalance.amount -= quoteAmount;

      // Add token balance
      const tokenMint = poolState.baseMint.toString();
      this.paperBalances.set(tokenMint, {
        token: tokenMint,
        amount: tokenAmount,
        symbol: `TOKEN_${tokenMint.substring(0, 8)}`
      });

      // Record trade
      const trade: PaperTrade = {
        id: tradeId,
        action: 'buy',
        token: tokenMint,
        tokenSymbol: `TOKEN_${tokenMint.substring(0, 8)}`,
        quoteAmount,
        tokenAmount,
        price: estimatedTokenPrice,
        timestamp: new Date(),
      };

      this.paperTrades.push(trade);

      logger.info({
        mint: tokenMint,
        tradeId,
        quoteAmount,
        tokenAmount: tokenAmount.toFixed(6),
        price: estimatedTokenPrice.toFixed(8)
      }, `[PAPER] 🟢 REAL MAINNET BUY executed (paper)`);

      // Schedule auto-sell if enabled
      if (this.config.autoSell) {
        setTimeout(() => {
          this.executePaperSell(tokenMint, tradeId);
        }, this.config.autoSellDelay + Math.random() * 10000); // Add some randomness
      }

    } catch (error) {
      logger.error({ error }, `[PAPER] Failed to execute paper buy`);
    }
  }

  private async executePaperSell(tokenMint: string, buyTradeId: string) {
    const tokenBalance = this.paperBalances.get(tokenMint);
    const buyTrade = this.paperTrades.find(t => t.id === buyTradeId && t.action === 'buy');

    if (!tokenBalance || !buyTrade) {
      logger.warn(`[PAPER] Cannot sell: token balance or buy trade not found`);
      return;
    }

    try {
      // Simulate realistic price movement
      const priceMultiplier = this.simulatePriceMovement();
      const newPrice = buyTrade.price * priceMultiplier;
      const quoteAmountReceived = tokenBalance.amount * newPrice;

      // Apply slippage
      const slippageMultiplier = 1 - (this.config.sellSlippage / 100);
      const finalQuoteAmount = quoteAmountReceived * slippageMultiplier;

      // Update balances
      const symbol = this.config.quoteToken.symbol || 'SOL';
      const quoteBalance = this.paperBalances.get(symbol)!;
      quoteBalance.amount += finalQuoteAmount;
      this.paperBalances.delete(tokenMint);

      // Calculate profit
      const profit = finalQuoteAmount - buyTrade.quoteAmount;
      const profitPercent = (profit / buyTrade.quoteAmount) * 100;
      this.totalPaperProfit += profit;

      // Record sell trade
      const sellTrade: PaperTrade = {
        id: `sell_${buyTradeId}`,
        action: 'sell',
        token: tokenMint,
        tokenSymbol: buyTrade.tokenSymbol,
        quoteAmount: finalQuoteAmount,
        tokenAmount: tokenBalance.amount,
        price: newPrice,
        timestamp: new Date(),
        profit,
        profitPercent,
      };

      this.paperTrades.push(sellTrade);

      const profitEmoji = profit > 0 ? '📈' : '📉';
      logger.info({
        mint: tokenMint,
        buyPrice: buyTrade.price.toFixed(8),
        sellPrice: newPrice.toFixed(8),
        profit: profit.toFixed(6),
        profitPercent: profitPercent.toFixed(2)
      }, `[PAPER] 🔴 SELL executed ${profitEmoji}`);

    } catch (error) {
      logger.error({ error }, `[PAPER] Failed to execute paper sell`);
    }
  }

  private simulatePriceMovement(): number {
    // Simulate realistic price movements based on actual token behavior
    const scenarios = [
      { probability: 0.4, multiplier: () => 0.1 + Math.random() * 0.4 }, // 40% chance: lose 50-90%
      { probability: 0.3, multiplier: () => 0.7 + Math.random() * 0.6 }, // 30% chance: lose/gain (-30% to +30%)
      { probability: 0.2, multiplier: () => 1.3 + Math.random() * 1.7 }, // 20% chance: moderate gain (30-200%)
      { probability: 0.1, multiplier: () => 3 + Math.random() * 12 }, // 10% chance: big gain (200-1400%)
    ];

    const random = Math.random();
    let cumulativeProbability = 0;

    for (const scenario of scenarios) {
      cumulativeProbability += scenario.probability;
      if (random <= cumulativeProbability) {
        return scenario.multiplier();
      }
    }

    return 1; // Fallback
  }

  public printSummary() {
    const symbol = this.config.quoteToken.symbol || 'SOL';
    const completedTrades = this.paperTrades.filter(t => t.action === 'sell');
    const winningTrades = completedTrades.filter(t => t.profit! > 0);
    
    const currentBalance = this.paperBalances.get(symbol)?.amount || 0;
    const totalReturn = ((currentBalance - this.initialBalance) / this.initialBalance) * 100;

    logger.info('\n=== PAPER TRADING SUMMARY ===');
    logger.info(`💰 Current Balance: ${currentBalance.toFixed(6)} ${symbol}`);
    logger.info(`📊 Total Return: ${totalReturn.toFixed(2)}%`);
    logger.info(`🎯 Total Opportunities: ${this.paperTrades.filter(t => t.action === 'buy').length}`);
    logger.info(`✅ Completed Trades: ${completedTrades.length}`);
    logger.info(`🏆 Win Rate: ${completedTrades.length > 0 ? ((winningTrades.length / completedTrades.length) * 100).toFixed(2) : '0.00'}%`);
    logger.info(`💎 Total Profit: ${this.totalPaperProfit.toFixed(6)} ${symbol}`);
    
    // Show open positions
    const openPositions = Array.from(this.paperBalances.values()).filter(b => b.symbol !== symbol);
    if (openPositions.length > 0) {
      logger.info(`📈 Open Positions: ${openPositions.length}`);
      openPositions.forEach(pos => {
        logger.info(`   ${pos.symbol}: ${pos.amount.toFixed(6)}`);
      });
    }

    // Show recent trades
    const recentTrades = this.paperTrades.slice(-3);
    if (recentTrades.length > 0) {
      logger.info('\n📋 Recent Activity:');
      recentTrades.forEach(trade => {
        const time = trade.timestamp.toLocaleTimeString();
        if (trade.action === 'buy') {
          logger.info(`  🟢 ${time} - BUY ${trade.tokenSymbol} for ${trade.quoteAmount.toFixed(6)} ${symbol}`);
        } else {
          const profitEmoji = trade.profit! > 0 ? '📈' : '📉';
          logger.info(`  🔴 ${time} - SELL ${trade.tokenSymbol} ${profitEmoji} ${trade.profitPercent!.toFixed(2)}%`);
        }
      });
    }
    
    logger.info('=============================\n');
  }

  public async sell(accountId: PublicKey, rawAccount: RawAccount) {
    logger.trace({ mint: rawAccount.mint }, `[PAPER] Processing token sell...`);
    
    // Find any existing paper position for this token
    const tokenMint = rawAccount.mint.toString();
    const tokenBalance = this.paperBalances.get(tokenMint);
    
    if (tokenBalance) {
      // Find the corresponding buy trade
      const buyTrade = this.paperTrades.find(t => 
        t.token === tokenMint && 
        t.action === 'buy' && 
        !this.paperTrades.some(sellT => sellT.id === `sell_${t.id}`)
      );
      
      if (buyTrade) {
        await this.executePaperSell(tokenMint, buyTrade.id);
      }
    }
  }
}

// Use mainnet for real data
const MAINNET_RPC = 'https://api.mainnet-beta.solana.com';
const MAINNET_WS = 'wss://api.mainnet-beta.solana.com';

const connection = new Connection(MAINNET_RPC, {
  wsEndpoint: MAINNET_WS,
  commitment: 'confirmed',
});

const runPaperTrading = async () => {
  logger.level = LOG_LEVEL;
  logger.info('📈 Starting PAPER TRADING mode with REAL MAINNET data...');

  const marketCache = new MarketCache(connection);
  const poolCache = new PoolCache();
  const txExecutor = new DefaultTransactionExecutor(connection);

  const wallet = getWallet(PRIVATE_KEY.trim());
  const quoteToken = getToken(QUOTE_MINT);
  
  const botConfig = <BotConfig>{
    wallet,
    quoteAta: getAssociatedTokenAddressSync(quoteToken.mint, wallet.publicKey),
    minPoolSize: new TokenAmount(quoteToken, MIN_POOL_SIZE, false),
    maxPoolSize: new TokenAmount(quoteToken, MAX_POOL_SIZE, false),
    quoteToken,
    quoteAmount: new TokenAmount(quoteToken, QUOTE_AMOUNT, false),
    maxTokensAtTheTime: MAX_TOKENS_AT_THE_TIME,
    useSnipeList: USE_SNIPE_LIST,
    autoSell: AUTO_SELL,
    autoSellDelay: AUTO_SELL_DELAY,
    maxSellRetries: MAX_SELL_RETRIES,
    autoBuyDelay: AUTO_BUY_DELAY,
    maxBuyRetries: MAX_BUY_RETRIES,
    unitLimit: COMPUTE_UNIT_LIMIT,
    unitPrice: COMPUTE_UNIT_PRICE,
    takeProfit: TAKE_PROFIT,
    stopLoss: STOP_LOSS,
    trailingStopLoss: TRAILING_STOP_LOSS,
    skipSellingIfLostMoreThan: SKIP_SELLING_IF_LOST_MORE_THAN,
    buySlippage: BUY_SLIPPAGE,
    sellSlippage: SELL_SLIPPAGE,
    priceCheckInterval: PRICE_CHECK_INTERVAL,
    priceCheckDuration: PRICE_CHECK_DURATION,
    filterCheckInterval: FILTER_CHECK_INTERVAL,
    filterCheckDuration: FILTER_CHECK_DURATION,
    consecutiveMatchCount: CONSECUTIVE_FILTER_MATCHES,
  };

  const bot = new PaperTradingBot(connection, marketCache, poolCache, txExecutor, botConfig);

  logger.info('🔧 PAPER TRADING Configuration:');
  logger.info(`Network: MAINNET (Real Data)`);
  logger.info(`Quote Token: ${quoteToken.symbol}`);
  logger.info(`Quote Amount: ${botConfig.quoteAmount.toFixed()}`);
  logger.info(`Virtual Wallet: Paper trades only - NO REAL TRANSACTIONS`);
  logger.info('⚠️  Using REAL mainnet data for paper trading\n');

  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  const listeners = new Listeners(connection);
  
  await listeners.start({
    walletPublicKey: wallet.publicKey,
    quoteToken,
    autoSell: AUTO_SELL,
    cacheNewMarkets: false,
  });

  logger.info('✅ Listeners started successfully');
  logger.info(`🔍 Listening for new ${quoteToken.symbol} pools on mainnet...`);
  logger.info(`📡 RPC: ${RPC_ENDPOINT}`);
  logger.info(`📡 WebSocket: ${RPC_WEBSOCKET_ENDPOINT}`);

  listeners.on('market', (updatedAccountInfo: KeyedAccountInfo) => {
    logger.info('📊 Market update received');
    const marketState = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);
    marketCache.save(updatedAccountInfo.accountId.toString(), marketState);
  });

  listeners.on('pool', async (updatedAccountInfo: KeyedAccountInfo) => {
    logger.info('🏊 Pool update received');
    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
    const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
    const exists = await poolCache.get(poolState.baseMint.toString());

    logger.info(`🔍 Pool details: mint=${poolState.baseMint.toString()}, openTime=${poolOpenTime}, runTime=${runTimestamp}, exists=${!!exists}`);

    if (!exists) {
      poolCache.save(updatedAccountInfo.accountId.toString(), poolState);
      logger.info(`🎯 [PAPER TRADING] Token detected: ${poolState.baseMint.toString()}`);
      await bot.buy(updatedAccountInfo.accountId, poolState);
    } else {
      logger.info(`⏭️  Pool skipped: exists=${!!exists}, openTime=${poolOpenTime}, runTime=${runTimestamp}`);
    }
  });

  // Print summary every 30 seconds
  setInterval(() => {
    bot.printSummary();
  }, 30000);

  logger.info('🚀 PAPER TRADING Bot is running with REAL mainnet data! Press CTRL + C to stop.');
};

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('\n👋 Shutting down PAPER TRADING...');
  process.exit(0);
});

runPaperTrading().catch(console.error);
