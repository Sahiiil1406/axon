/** Small, escaped React token renderer for the Solidity documentation example. */
export function SolidityCode({ source }: { source: string }) {
  const tokens=source.split(/(\/\/[^\n]*|\b(?:\d+(?:\.\d+)?|ether|days|registry|grantAgent|allow|account|agentKey|expiry|vault|rebalanceSelector)\b|[().,;])/g)
  return <code className="solidity-code">{tokens.map((token,index)=>{
    const kind=token.startsWith('//')?'comment':/^\d/.test(token)?'number':/^(ether|days)$/.test(token)?'unit':/^(grantAgent|allow)$/.test(token)?'function':token==='registry'?'object':/^[().,;]$/.test(token)?'punctuation':'variable'
    return <span key={index} className={`sol-token-${kind}`}>{token}</span>
  })}</code>
}
