"""
共享 HTTP 请求头常量
所有外部 API 请求统一使用此处定义的 User-Agent 和 Referer
"""

UA_DESKTOP = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

UA_MOBILE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) "
    "AppleWebKit/605.1.15"
)

REFERER_EASTMONEY = "https://fund.eastmoney.com/"


def eastmoney_fund_headers(fund_code: str = "") -> dict:
    """返回天天基金通用请求头，fund_code 非空时使用基金详情页 Referer"""
    referer = f"http://fund.eastmoney.com/{fund_code}.html" if fund_code else REFERER_EASTMONEY
    return {"User-Agent": UA_DESKTOP, "Referer": referer}


def eastmoney_mobile_headers() -> dict:
    """返回天天基金移动端请求头（FundCoreDiyNew 等接口）"""
    return {"User-Agent": UA_MOBILE, "Referer": REFERER_EASTMONEY}
