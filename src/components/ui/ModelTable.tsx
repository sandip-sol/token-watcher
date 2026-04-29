interface ModelStats {
  provider: string
  model: string
  totalCostUsd: number
  totalTokens: number
  callCount: number
  avgLatencyMs: number
}

interface ModelTableProps {
  data: ModelStats[]
  loading?: boolean
}

export function ModelTable({ data, loading = false }: ModelTableProps) {
  const totalCost = data.reduce((sum, item) => sum + item.totalCostUsd, 0)

  return (
    <div className="tw-table-wrap">
      <table className="tw-model-table">
        <thead>
          <tr>
            <th>Model</th>
            <th>Provider</th>
            <th>Calls</th>
            <th>Tokens</th>
            <th>Cost</th>
            <th>Share</th>
            <th>Avg Latency</th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, index) => (
                <tr key={index}>
                  {Array.from({ length: 7 }).map((__, cellIndex) => (
                    <td key={cellIndex}>
                      <div className="tw-skeleton tw-table-skeleton" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map(item => {
                const share = totalCost > 0 ? (item.totalCostUsd / totalCost) * 100 : 0

                return (
                  <tr key={`${item.provider}-${item.model}`}>
                    <td className="tw-model-name">{item.model}</td>
                    <td>
                      <span className={`tw-provider-badge tw-provider-${item.provider.toLowerCase()}`}>
                        {item.provider}
                      </span>
                    </td>
                    <td>{item.callCount.toLocaleString()}</td>
                    <td>{item.totalTokens.toLocaleString()}</td>
                    <td>${item.totalCostUsd.toFixed(4)}</td>
                    <td>
                      <div className="tw-share-cell">
                        <div className="tw-share-track">
                          <div className="tw-share-bar" style={{ width: `${Math.min(share, 100)}%` }} />
                        </div>
                        <span>{share.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>{item.avgLatencyMs.toLocaleString()}ms</td>
                  </tr>
                )
              })}
          {!loading && data.length === 0 ? (
            <tr>
              <td colSpan={7}>
                <div className="tw-empty-state">No model usage recorded yet</div>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
