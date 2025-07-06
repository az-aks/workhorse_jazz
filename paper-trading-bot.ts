import { Bot, BotConfig } from './bot';
import { MarketCache, PoolCache } from './cache';
import { TransactionExecutor } from './transactions';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { LiquidityStateV4, TokenAmount, Token } from '@raydium-io/raydium-sdk';
import { RawAccount } from '@solana/spl-token';
import { logger } from './helpers';

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

export class PaperTradingBot extends Bot {
  private paperBalances: Map<string, PaperBalance> = new Map();
  private paperTrades: PaperTrade[] = [];
  private totalPaperProfit = 0;
  private tradeCounter = 0;
  private initialBalance = 0;

  constructor(
    connection: Connection,
    marketStorage: MarketCache,
    poolStorage: PoolCache,
    txExecutor: TransactionExecutor,
    config: BotConfig,
  ) {
    super(connection, marketStorage, poolStorage, txExecutor, config);
    this.initializePaperBalances();
  }

  private initializePaperBalances() {
    // Initialize with virtual balances
    if (this.config.quoteToken.symbol === 'USDC') {
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

    logger.info(`💰 Paper Trading initialized with ${this.initialBalance} ${this.config.quoteToken.symbol}`);
  }

  public async buy(accountId: PublicKey, poolState: LiquidityStateV4) {
    logger.trace({ mint: poolState.baseMint }, `[PAPER] Processing new pool...`);

    // Check if we should skip based on snipe list
    if (this.config.useSnipeList && !this.snipeListCache?.isInList(poolState.baseMint.toString())) {
      logger.debug({ mint: poolState.baseMint.toString() }, `[PAPER] Skipping buy because token is not in a snipe list`);
      return;
    }

    // Apply buy delay if configured
    if (this.config.autoBuyDelay > 0) {
      logger.debug({ mint: poolState.baseMint }, `[PAPER] Waiting for ${this.config.autoBuyDelay} ms before buy`);
      await new Promise(resolve => setTimeout(resolve, this.config.autoBuyDelay));
    }

    try {
      const [market] = await Promise.all([
        this.marketStorage.get(poolState.marketId.toString()),
      ]);

      if (!market) {
        logger.debug({ mint: poolState.baseMint.toString() }, `[PAPER] Market not found, skipping`);
        return;
      }

      const poolKeys = this.createPoolKeys(accountId, poolState, market);

      // Apply filters if not using snipe list
      if (!this.config.useSnipeList) {
        const match = await this.filterMatch(poolKeys);
        if (!match) {
          logger.trace({ mint: poolKeys.baseMint.toString() }, `[PAPER] Skipping buy because pool doesn't match filters`);
          return;
        }
      }

      // Execute paper trade
      await this.executePaperBuy(poolKeys, poolState);

    } catch (error) {
      logger.error({ mint: poolState.baseMint.toString(), error }, `[PAPER] Failed to process buy`);
    }
  }

  private async executePaperBuy(poolKeys: any, poolState: LiquidityStateV4) {
    const quoteBalance = this.paperBalances.get(this.config.quoteToken.symbol);
    const quoteAmount = parseFloat(this.config.quoteAmount.toFixed());

    if (!quoteBalance || quoteBalance.amount < quoteAmount) {
      logger.warn(`[PAPER] Insufficient ${this.config.quoteToken.symbol} balance for buy: ${quoteBalance?.amount || 0} < ${quoteAmount}`);
      return;
    }

    try {
      // Simulate getting pool info and calculating token amount
      // For paper trading, we'll estimate token amount based on a random price
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
      }, `[PAPER] 🟢 BUY executed`);

      // Schedule auto-sell if enabled
      if (this.config.autoSell) {
        setTimeout(() => {
          this.executePaperSell(tokenMint, tradeId);
        }, this.config.autoSellDelay);
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
      // Simulate price movement for realistic paper trading
      const priceMultiplier = this.simulatePriceMovement();
      const newPrice = buyTrade.price * priceMultiplier;
      const quoteAmountReceived = tokenBalance.amount * newPrice;

      // Apply slippage
      const slippageMultiplier = 1 - (this.config.sellSlippage / 100);
      const finalQuoteAmount = quoteAmountReceived * slippageMultiplier;

      // Update balances
      const quoteBalance = this.paperBalances.get(this.config.quoteToken.symbol)!;
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
    // Simulate realistic price movements based on common token behavior
    const scenarios = [
      { probability: 0.4, multiplier: () => 0.3 + Math.random() * 0.4 }, // 40% chance: lose 30-70%
      { probability: 0.3, multiplier: () => 0.8 + Math.random() * 0.4 }, // 30% chance: small loss/gain (-20% to +20%)
      { probability: 0.2, multiplier: () => 1.2 + Math.random() * 0.8 }, // 20% chance: moderate gain (20-100%)
      { probability: 0.1, multiplier: () => 2 + Math.random() * 8 }, // 10% chance: big gain (100-900%)
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

  public async sell(accountId: PublicKey, rawAccount: RawAccount) {
    // For paper trading, this method is less relevant since we control the selling
    // But we can implement it for completeness
    const tokenMint = rawAccount.mint.toString();
    const buyTradeId = this.paperTrades.find(t => t.token === tokenMint && t.action === 'buy')?.id;
    
    if (buyTradeId) {
      await this.executePaperSell(tokenMint, buyTradeId);
    }
  }

  private createPoolKeys(accountId: PublicKey, poolState: LiquidityStateV4, market: any) {
    // This is a simplified version - in real implementation you'd import from helpers
    return {
      baseMint: poolState.baseMint,
      quoteMint: poolState.quoteMint,
      // Add other required fields as needed
    };
  }

  private async filterMatch(poolKeys: any): Promise<boolean> {
    // Simplified filter matching - in real implementation you'd use the actual filters
    return Math.random() > 0.7; // 30% pass rate for simulation
  }

  public getPaperTradingResults() {
    const completedTrades = this.paperTrades.filter(t => t.action === 'sell');
    const winningTrades = completedTrades.filter(t => t.profit! > 0);
    
    const currentBalance = this.paperBalances.get(this.config.quoteToken.symbol)?.amount || 0;
    const totalReturn = ((currentBalance - this.initialBalance) / this.initialBalance) * 100;

    return {
      totalTrades: this.paperTrades.filter(t => t.action === 'buy').length,
      completedTrades: completedTrades.length,
      winningTrades: winningTrades.length,
      winRate: completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0,
      totalProfit: this.totalPaperProfit,
      currentBalance,
      initialBalance: this.initialBalance,
      totalReturn,
      trades: this.paperTrades,
      balances: Array.from(this.paperBalances.values()),
    };
  }

  public printPaperTradingSummary() {
    const results = this.getPaperTradingResults();
    
    logger.info('\n=== PAPER TRADING SUMMARY ===');
    logger.info(`💰 Current Balance: ${results.currentBalance.toFixed(6)} ${this.config.quoteToken.symbol}`);
    logger.info(`📊 Total Return: ${results.totalReturn.toFixed(2)}%`);
    logger.info(`🎯 Total Trades: ${results.totalTrades}`);
    logger.info(`✅ Completed: ${results.completedTrades}`);
    logger.info(`🏆 Win Rate: ${results.winRate.toFixed(2)}%`);
    logger.info(`💎 Total Profit: ${results.totalProfit.toFixed(6)} ${this.config.quoteToken.symbol}`);
    
    // Show open positions
    const openPositions = results.balances.filter(b => b.symbol !== this.config.quoteToken.symbol);
    if (openPositions.length > 0) {
      logger.info(`📈 Open Positions: ${openPositions.length}`);
      openPositions.forEach(pos => {
        logger.info(`   ${pos.symbol}: ${pos.amount.toFixed(6)}`);
      });
    }

    // Show recent trades
    const recentTrades = results.trades.slice(-5);
    if (recentTrades.length > 0) {
      logger.info('\n📋 Recent Activity:');
      recentTrades.forEach(trade => {
        const time = trade.timestamp.toLocaleTimeString();
        if (trade.action === 'buy') {
          logger.info(`  🟢 ${time} - BUY ${trade.tokenSymbol} for ${trade.quoteAmount.toFixed(6)} ${this.config.quoteToken.symbol}`);
        } else {
          const profitEmoji = trade.profit! > 0 ? '📈' : '📉';
          logger.info(`  🔴 ${time} - SELL ${trade.tokenSymbol} ${profitEmoji} ${trade.profitPercent!.toFixed(2)}%`);
        }
      });
    }
    
    logger.info('=============================\n');
  }
}
