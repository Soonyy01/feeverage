// English / 简体中文. Static text uses data-i18n (text), data-i18n-html (markup)
// and data-i18n-ph (placeholder); scripts use t().
const D = {
  en: {
    "m.positions": "Positions", "m.positions.s": "Your tokens & PnL",
    "w.copy": "Copy address", "w.explorer": "View on explorer",
    "p.kicker": "Your wallet", "p.title": "Positions",
    "p.connect": "Connect your wallet to see the Feeverage tokens you hold, what they are worth right now and your profit or loss.",
    "p.eth": "ETH balance", "p.eth.s": "on Robinhood Chain", "p.value": "Holdings value", "p.value.s": "marked to live price",
    "p.cost": "Total spent", "p.cost.s": "on Feeverage curves", "p.pnl": "Total PnL", "p.pnl.s": "realized + unrealized",
    "p.holdings": "Holdings", "p.history": "Your trades",
    "p.none": "No Feeverage tokens in this wallet yet.", "p.none.cta": "Browse tokens →",
    "p.bal": "Balance", "p.price": "Price", "p.avg": "Avg. entry", "p.val": "Value", "p.ret": "PnL", "p.move": "since your entry",
    "p.buy": "Buy", "p.sell": "Sell", "p.trade": "Trade →", "p.loading": "Reading your wallet on Robinhood Chain…",
    "p.note": "Cost and PnL count trades made on Feeverage bonding curves. Tokens received another way have no entry price.",
    "p.notrades": "No trades yet.",
    "t.you": "Your position", "t.you.none": "You do not hold this token yet.",
    menu: "Menu",
    "m.launch": "Launch", "m.launch.s": "Create a token",
    "m.docs": "Docs", "m.docs.s": "Full documentation",
    "m.connect": "Connect wallet", "m.connect.s": "Email, social or wallet",
    "m.disconnect": "Disconnect", "m.loading": "Loading wallet…",
    "m.lang": "Language", "m.theme": "Theme", "m.light": "Light", "m.dark": "Dark",
    "m.x.none": "Set xUrl in config.js",

    "hero.strip": "Your token's fees. Leveraged.",
    "hero.copy": "Launch a token on <strong>Robinhood Chain</strong>. Every trade pays a fee, and every fee is wired into one leveraged <strong>Hyperliquid</strong> position the creator picks at launch. Holders watch it run, or get liquidated, in public.",
    "hero.launch": "Launch a token →", "hero.browse": "Browse tokens",
    "fig.title": "Margin / Notional", "fig.margin": "1× margin", "fig.notional": "Notional",
    "fig.copy": "$1 of trading fees becomes <b id=\"heroNotional\">$5</b> of exposure on Hyperliquid.",

    "st.tokens": "Tokens launched", "st.tokens.s": "on Robinhood Chain",
    "st.fees": "Fees routed", "st.margin": "Margin deployed", "st.margin.s": "USDC on Hyperliquid",
    "st.notional": "Open notional", "st.notional.s": "across all positions",
    "st.pnl": "Unrealized PnL", "st.pnl.s": "live mark-to-market",
    "st.long": "Long", "st.short": "Short",

    "how.kicker": "The machine", "how.title": "How it works",
    "how.lede": "Feeverage turns a memecoin into a fund with one job: every fee its traders pay is added to a single leveraged bet on Hyperliquid. Here is the whole loop, start to finish.",
    "how.s1.t": "Launch", "how.s1.p": "Pick a name, ticker and logo, then the position: a Hyperliquid market (BTC, ETH, HYPE, SOL, XRP or DOGE), long or short, and 1× to 20× leverage. One transaction on Robinhood Chain creates the token, its bonding curve and your first buy. The strategy is written into the token itself and can never be changed.",
    "how.s2.t": "Trade", "how.s2.p": "The token trades against a bonding curve priced in ETH. Every buy and sell pays a trading fee. The creator share of that fee, plus any extra tax the creator set, goes to Feeverage instead of a person.",
    "how.s3.t": "Collect", "how.s3.p": "Fees build up inside the curve and are released to an on-chain escrow when the curve is swept. The Feeverage keeper claims them every few minutes and books every wei to the token it came from, using the curve's own fee events.",
    "how.s4.t": "Bridge", "how.s4.p": "When a token has at least $12 of fees waiting, the keeper bridges that ETH to USDC and deposits it straight into the token's own Hyperliquid account. Each token has its own account, so positions never mix.",
    "how.s5.t": "Lever up", "how.s5.p": "The new margin is put to work at once: size = deposit × 0.95 × leverage, in the token's market and direction, cross margin. 5% stays aside for trading fees and funding. The position is never closed by Feeverage.",
    "how.s6.t": "Graduate & beyond", "how.s6.p": "When the curve fills, the token graduates to a Uniswap v4 pool with locked liquidity. Fees keep flowing to the position from the pool. If the position is ever liquidated, the next fees simply open a new one with the same settings.",
    "how.ex.t": "Example", "how.ex.p": "A token set to <b>5× long BTC</b> collects <b>$100</b> of fees.",
    "how.ex.r1": "Fees bridged", "how.ex.r2": "Kept for fees & funding (5%)", "how.ex.r3": "Margin used",
    "how.ex.r4": "Position opened (× 5)", "how.ex.r5": "If BTC rises 10%", "how.ex.r6": "If BTC falls ~19%",
    "how.ex.liq": "liquidated",
    "how.read.t": "Reading a token",
    "how.g.strat": "Strategy", "how.g.strat.d": "Market, side and leverage the fees are used for. Fixed at launch.",
    "how.g.pnl": "Live PnL", "how.g.pnl.d": "Profit or loss of the open position, recalculated every second from the live price.",
    "how.g.funded": "Funded", "how.g.funded.d": "Total fees already bridged into the position, in USD.",
    "how.g.topup": "Next top-up", "how.g.topup.d": "Fees waiting on Robinhood Chain. At $12 they are bridged and added to the position.",
    "how.g.liq": "Liquidation", "how.g.liq.d": "Price at which the position is wiped out, and how far away it is right now.",
    "how.g.curve": "Curve", "how.g.curve.d": "How full the bonding curve is. At 100% the token graduates to Uniswap v4.",
    "how.docs": "Read the full docs →",

    "tok.kicker": "All launches", "tok.title": "Tokens",
    "tok.v.new": "Newest", "tok.v.live": "Live positions", "tok.v.pnl": "Top PnL", "tok.v.mcap": "Top MCAP",
    "tok.v.funded": "Most funded", "tok.v.next": "Next top-up", "tok.v.grad": "Graduated",
    "tok.all": "All", "tok.long": "Long", "tok.short": "Short",
    "tok.search": "Search ticker, name or market",
    "tok.empty": "No tokens yet", "tok.empty.p": "The first launch shows up here, live.", "tok.nomatch": "Nothing matches these filters.",
    "card.mcap": "MCAP", "card.funded": "funded", "card.waiting": "Opens at $12", "card.next": "Next top-up",
    "card.copy": "Copied", "card.grad": "Graduated", "card.reopen": "Reopens at $12",

    "src.keeper": "Live · keeper", "src.chain": "Live from Robinhood Chain", "src.none": "Live data starts with the first launch",
    "src.connecting": "Connecting to Robinhood Chain…",


    "l.kicker": "New token", "l.title": "Launch",
    "l.token": "Token", "l.position": "Position", "l.launch": "Launch",
    "l.name": "Name", "l.ticker": "Ticker", "l.logo": "Logo", "l.logo.s": "Drop an image here or tap to choose · png, jpg, webp, gif", "l.logo.up": "Uploading…", "l.logo.ok": "Logo ready", "l.logo.err": "Upload failed", "l.logo.link": "Use an image link instead", "l.logo.file": "Use an image file instead", "l.logo.wait": "Wait for the logo to finish uploading.", "l.logo.change": "Change",
    "l.desc": "Description", "l.desc.s": "Your strategy line is added at the end automatically",
    "l.desc.ph": "Every trade feeds one leveraged position on Hyperliquid.",
    "l.web": "Website", "l.market": "Hyperliquid market", "l.lev": "Leverage",
    "l.buy": "Your first buy", "l.buy.s": "ETH, required (min 0.0001)",
    "l.tax": "Extra trade tax", "l.tax.s": "%, on top of the base fee, also funds the position",
    "l.go": "Launch token", "l.summary": "Summary",
    "l.fee": "Launch fee", "l.first": "Your first buy", "l.send": "You send",
    "l.per100": "Every $100 of fees opens", "l.toliq": "Move to liquidation", "l.mark": "Live price",
    "l.note": "Liquidation distance is approximate: the position is cross margin and grows with every deposit, so its average entry moves. Hyperliquid fees and funding come out of the margin.",
    "l.down": "down", "l.up": "up",
    "l.c.fee": "Fee recipient set", "l.c.fee.x": "Set feeRecipient in config.js",
    "l.c.chain": "Robinhood Chain reachable", "l.c.chain.x": "Robinhood Chain not reachable",
    "l.c.wallet": "Wallet connected", "l.c.wallet.x": "Connect a wallet",
    "l.c.gate": "Launching allowed for this wallet", "l.c.gate.x": "Launching is gated for this wallet right now",
    "l.open": "Launching open", "l.gated": "Launching gated", "l.unreach": "Chain unreachable",
    "l.e.name": "Name and ticker are required.", "l.e.buy": "The first buy must be at least 0.0001 ETH.",
    "l.e.fee": "Set feeRecipient in config.js before launching.", "l.e.long": "Description is too long.",
    "l.s.conn": "Connecting wallet…", "l.s.sim": "Simulating…", "l.s.confirm": "Confirm the launch in your wallet…",
    "l.s.sent": "Sent. Waiting for the block…", "l.s.live": "is live.", "l.s.open": "Open the token page →",

    "t.back": "← All tokens", "t.missing": "Token not found", "t.missing.p": "It may still be loading, or it was not launched through Feeverage.",
    "t.position": "Position", "t.funded": "Funded", "t.margin": "Margin", "t.notional": "Notional", "t.size": "Size",
    "t.pnl": "Live PnL", "t.entry": "Entry price", "t.mark": "Live price", "t.liq": "Liq. price",
    "t.fees": "Fees routed", "t.waiting": "Fees waiting", "t.curve": "Bonding curve", "t.mcap": "Market cap",
    "t.health": "Health", "t.toliq": "to liquidation", "t.nopos": "No position yet",
    "t.h.safe": "Safe", "t.h.ok": "Healthy", "t.h.tight": "Tight", "t.h.danger": "Danger",
    "t.next": "Next top-up", "t.about": "About", "t.trade": "Trade", "t.buy": "Buy", "t.sell": "Sell",
    "t.pay": "Pay (ETH)", "t.sellamt": "Sell", "t.quote": "Enter an amount", "t.noquote": "Could not quote",
    "t.approve": "Approve first or check your balance", "t.confirm": "Confirm in your wallet…", "t.approving": "Approve the token first…",
    "t.done": "Done. Every trade feeds the position.", "t.push": "Push fees to the position", "t.pushed": "Fees released. The keeper bridges them on its next run.",
    "t.grad": "This token graduated and now trades on a Uniswap v4 pool on Robinhood Chain. Use any Robinhood Chain swap app with the contract address.",
    "t.contract": "Contract", "t.creator": "Creator", "t.hl": "Hyperliquid account", "t.hl.wait": "assigned by keeper",
    "t.curve.grad": "Graduated to a Uniswap v4 pool on Robinhood Chain.", "t.curve.to": "to graduation", "t.nodesc": "No description.",
  },
  zh: {
    "m.positions": "持仓", "m.positions.s": "你的代币与盈亏",
    "w.copy": "复制地址", "w.explorer": "在浏览器中查看",
    "p.kicker": "你的钱包", "p.title": "持仓",
    "p.connect": "连接钱包即可查看你持有的 Feeverage 代币、当前价值以及盈亏。",
    "p.eth": "ETH 余额", "p.eth.s": "Robinhood Chain 上", "p.value": "持仓价值", "p.value.s": "按实时价格计算",
    "p.cost": "总投入", "p.cost.s": "在 Feeverage 曲线上", "p.pnl": "总盈亏", "p.pnl.s": "已实现 + 未实现",
    "p.holdings": "持有代币", "p.history": "你的交易",
    "p.none": "这个钱包还没有 Feeverage 代币。", "p.none.cta": "浏览代币 →",
    "p.bal": "余额", "p.price": "价格", "p.avg": "平均成本", "p.val": "价值", "p.ret": "盈亏", "p.move": "相对你的成本",
    "p.buy": "买入", "p.sell": "卖出", "p.trade": "交易 →", "p.loading": "正在读取你在 Robinhood Chain 上的钱包…",
    "p.note": "成本和盈亏只统计在 Feeverage 联合曲线上的交易。通过其他方式获得的代币没有成本价。",
    "p.notrades": "还没有交易。",
    "t.you": "你的持仓", "t.you.none": "你还没有持有这个代币。",
    menu: "菜单",
    "m.launch": "发射", "m.launch.s": "创建代币",
    "m.docs": "文档", "m.docs.s": "完整说明",
    "m.connect": "连接钱包", "m.connect.s": "邮箱、社交账号或钱包",
    "m.disconnect": "断开连接", "m.loading": "正在加载钱包…",
    "m.lang": "语言", "m.theme": "主题", "m.light": "浅色", "m.dark": "深色",
    "m.x.none": "请在 config.js 中设置 xUrl",

    "hero.strip": "你的代币手续费，加杠杆。",
    "hero.copy": "在 <strong>Robinhood Chain</strong> 上发射代币。每笔交易都会支付手续费，每一笔手续费都会注入创建者在发射时选定的一个 <strong>Hyperliquid</strong> 杠杆仓位。持有者可以公开看着它增长，或者被清算。",
    "hero.launch": "发射代币 →", "hero.browse": "浏览代币",
    "fig.title": "保证金 / 名义价值", "fig.margin": "1× 保证金", "fig.notional": "名义价值",
    "fig.copy": "每 $1 交易手续费在 Hyperliquid 上变成 <b id=\"heroNotional\">$5</b> 的敞口。",

    "st.tokens": "已发射代币", "st.tokens.s": "在 Robinhood Chain 上",
    "st.fees": "已导入手续费", "st.margin": "已投入保证金", "st.margin.s": "Hyperliquid 上的 USDC",
    "st.notional": "持仓名义价值", "st.notional.s": "所有仓位合计",
    "st.pnl": "未实现盈亏", "st.pnl.s": "实时按市价计算",
    "st.long": "做多", "st.short": "做空",

    "how.kicker": "运作机制", "how.title": "运作方式",
    "how.lede": "Feeverage 把一个 meme 币变成只有一个任务的基金：交易者支付的每一笔手续费，都会加到 Hyperliquid 上的同一个杠杆仓位里。下面是完整流程。",
    "how.s1.t": "发射", "how.s1.p": "填写名称、代码和 logo，然后选择仓位：Hyperliquid 市场（BTC、ETH、HYPE、SOL、XRP 或 DOGE）、做多或做空，以及 1× 到 20× 的杠杆。在 Robinhood Chain 上一笔交易即可创建代币、它的联合曲线和你的首笔买入。策略写入代币本身，永远无法更改。",
    "how.s2.t": "交易", "how.s2.p": "代币在以 ETH 计价的联合曲线上交易。每次买入和卖出都会支付交易手续费。手续费中创建者的那一部分，加上创建者设置的额外税，全部进入 Feeverage，而不是任何个人。",
    "how.s3.t": "归集", "how.s3.p": "手续费在曲线内累积，曲线被清扫时释放到链上托管合约。Feeverage keeper 每隔几分钟领取一次，并根据曲线自身的手续费事件，把每一 wei 记到对应的代币名下。",
    "how.s4.t": "跨链", "how.s4.p": "当某个代币待处理的手续费达到 $12，keeper 会把这些 ETH 跨链换成 USDC，并直接存入该代币自己的 Hyperliquid 账户。每个代币都有独立账户，仓位永不混合。",
    "how.s5.t": "加杠杆", "how.s5.p": "新的保证金立即投入使用：仓位规模 = 存入金额 × 0.95 × 杠杆，按代币设定的市场和方向，全仓保证金。5% 留作交易手续费和资金费。Feeverage 永远不会主动平仓。",
    "how.s6.t": "毕业及之后", "how.s6.p": "曲线填满后，代币毕业进入流动性永久锁定的 Uniswap v4 池。池子产生的手续费继续流向仓位。如果仓位被清算，之后的手续费会用相同设置自动开新仓。",
    "how.ex.t": "示例", "how.ex.p": "一个设置为 <b>5× 做多 BTC</b> 的代币累计了 <b>$100</b> 手续费。",
    "how.ex.r1": "跨链的手续费", "how.ex.r2": "预留给手续费和资金费 (5%)", "how.ex.r3": "使用的保证金",
    "how.ex.r4": "开仓规模 (× 5)", "how.ex.r5": "若 BTC 上涨 10%", "how.ex.r6": "若 BTC 下跌约 19%",
    "how.ex.liq": "被清算",
    "how.read.t": "如何看懂代币卡片",
    "how.g.strat": "策略", "how.g.strat.d": "手续费所用的市场、方向和杠杆。发射时锁定。",
    "how.g.pnl": "实时盈亏", "how.g.pnl.d": "当前仓位的盈亏，每秒根据实时价格重新计算。",
    "how.g.funded": "已注资", "how.g.funded.d": "已经跨链注入仓位的手续费总额（美元）。",
    "how.g.topup": "下次加仓", "how.g.topup.d": "在 Robinhood Chain 上等待的手续费。达到 $12 后会跨链并加入仓位。",
    "how.g.liq": "清算", "how.g.liq.d": "仓位被清空的价格，以及当前距离它还有多远。",
    "how.g.curve": "曲线", "how.g.curve.d": "联合曲线的填充进度。达到 100% 时代币毕业进入 Uniswap v4。",
    "how.docs": "阅读完整文档 →",

    "tok.kicker": "全部发射", "tok.title": "代币",
    "tok.v.new": "最新", "tok.v.live": "持仓中", "tok.v.pnl": "盈亏最高", "tok.v.mcap": "市值最高",
    "tok.v.funded": "注资最多", "tok.v.next": "即将加仓", "tok.v.grad": "已毕业",
    "tok.all": "全部", "tok.long": "做多", "tok.short": "做空",
    "tok.search": "搜索代码、名称或市场",
    "tok.empty": "还没有代币", "tok.empty.p": "第一个发射的代币会实时出现在这里。", "tok.nomatch": "没有符合筛选条件的代币。",
    "card.mcap": "市值", "card.funded": "已注资", "card.waiting": "满 $12 开仓", "card.next": "下次加仓",
    "card.copy": "已复制", "card.grad": "已毕业", "card.reopen": "满 $12 重新开仓",

    "src.keeper": "实时 · keeper", "src.chain": "实时读取 Robinhood Chain", "src.none": "首个代币发射后开始显示实时数据",
    "src.connecting": "正在连接 Robinhood Chain…",


    "l.kicker": "新代币", "l.title": "发射",
    "l.token": "代币", "l.position": "仓位", "l.launch": "发射",
    "l.name": "名称", "l.ticker": "代码", "l.logo": "Logo", "l.logo.s": "把图片拖到这里或点击选择 · png、jpg、webp、gif", "l.logo.up": "上传中…", "l.logo.ok": "Logo 已就绪", "l.logo.err": "上传失败", "l.logo.link": "改用图片链接", "l.logo.file": "改用图片文件", "l.logo.wait": "请等待 logo 上传完成。", "l.logo.change": "更换",
    "l.desc": "简介", "l.desc.s": "策略说明会自动添加在末尾",
    "l.desc.ph": "每一笔交易都在为 Hyperliquid 上的一个杠杆仓位注资。",
    "l.web": "网站", "l.market": "Hyperliquid 市场", "l.lev": "杠杆",
    "l.buy": "首笔买入", "l.buy.s": "ETH，必填（最少 0.0001）",
    "l.tax": "额外交易税", "l.tax.s": "%，在基础手续费之上，同样注入仓位",
    "l.go": "发射代币", "l.summary": "摘要",
    "l.fee": "发射费", "l.first": "首笔买入", "l.send": "合计支付",
    "l.per100": "每 $100 手续费开仓", "l.toliq": "距清算", "l.mark": "实时价格",
    "l.note": "清算距离为估算值：仓位采用全仓保证金并随每次存入而增加，平均开仓价会变化。Hyperliquid 手续费和资金费从保证金中扣除。",
    "l.down": "下跌", "l.up": "上涨",
    "l.c.fee": "已设置手续费接收地址", "l.c.fee.x": "请在 config.js 中设置 feeRecipient",
    "l.c.chain": "已连接 Robinhood Chain", "l.c.chain.x": "无法连接 Robinhood Chain",
    "l.c.wallet": "钱包已连接", "l.c.wallet.x": "请连接钱包",
    "l.c.gate": "此钱包可以发射", "l.c.gate.x": "此钱包目前无法发射",
    "l.open": "开放发射", "l.gated": "发射受限", "l.unreach": "无法连接链",
    "l.e.name": "名称和代码为必填项。", "l.e.buy": "首笔买入至少 0.0001 ETH。",
    "l.e.fee": "发射前请在 config.js 中设置 feeRecipient。", "l.e.long": "简介太长。",
    "l.s.conn": "正在连接钱包…", "l.s.sim": "正在模拟交易…", "l.s.confirm": "请在钱包中确认发射…",
    "l.s.sent": "已发送，等待出块…", "l.s.live": "已上线。", "l.s.open": "打开代币页面 →",

    "t.back": "← 全部代币", "t.missing": "未找到代币", "t.missing.p": "可能仍在加载，或者该代币不是通过 Feeverage 发射的。",
    "t.position": "仓位", "t.funded": "已注资", "t.margin": "保证金", "t.notional": "名义价值", "t.size": "规模",
    "t.pnl": "实时盈亏", "t.entry": "开仓价", "t.mark": "实时价格", "t.liq": "清算价",
    "t.fees": "已导入手续费", "t.waiting": "待处理手续费", "t.curve": "联合曲线", "t.mcap": "市值",
    "t.health": "健康度", "t.toliq": "距清算", "t.nopos": "暂无仓位",
    "t.h.safe": "安全", "t.h.ok": "健康", "t.h.tight": "紧张", "t.h.danger": "危险",
    "t.next": "下次加仓", "t.about": "简介", "t.trade": "交易", "t.buy": "买入", "t.sell": "卖出",
    "t.pay": "支付 (ETH)", "t.sellamt": "卖出", "t.quote": "输入数量", "t.noquote": "无法报价",
    "t.approve": "请先授权或检查余额", "t.confirm": "请在钱包中确认…", "t.approving": "请先授权代币…",
    "t.done": "完成。每一笔交易都在为仓位注资。", "t.push": "将手续费推入仓位", "t.pushed": "手续费已释放，keeper 会在下一轮跨链。",
    "t.grad": "该代币已毕业，现在在 Robinhood Chain 的 Uniswap v4 池中交易。请使用任意 Robinhood Chain 兑换应用并输入合约地址。",
    "t.contract": "合约", "t.creator": "创建者", "t.hl": "Hyperliquid 账户", "t.hl.wait": "由 keeper 分配",
    "t.curve.grad": "已毕业进入 Robinhood Chain 上的 Uniswap v4 池。", "t.curve.to": "距毕业", "t.nodesc": "暂无简介。",
  },
};

const KEY = "feev.lang";
function initial() {
  try {
    const s = localStorage.getItem(KEY);
    if (s === "en" || s === "zh") return s;
  } catch {}
  return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
}
let lang = initial();
document.documentElement.lang = lang;

export const getLang = () => lang;
export const t = (k) => D[lang][k] ?? D.en[k] ?? k;

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
}

export function setLang(l) {
  lang = l === "zh" ? "zh" : "en";
  try { localStorage.setItem(KEY, lang); } catch {}
  document.documentElement.lang = lang;
  applyI18n();
  dispatchEvent(new CustomEvent("langchange", { detail: lang }));
}
