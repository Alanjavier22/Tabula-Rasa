import React, { useState } from 'react';
import type { AICategorySuggestion } from '../../services/AIAgentService';

interface AISuggestionsInboxProps {
  suggestions: AICategorySuggestion[];
  transactions: any[];
  categories: any[];
  onApproved: (approvedIds: string[]) => void;
}

export const AISuggestionsInbox: React.FC<AISuggestionsInboxProps> = ({
  suggestions,
  transactions,
  categories,
  onApproved,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isApproving, setIsApproving] = useState(false);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const getTransaction = (id: string) => transactions.find(t => t.id === id);
  const getCategory = (id: string) => categories.find(c => c.id === id);

  return (
    <div className="ai-suggestions-inbox">
      <h2>AI Category Suggestions</h2>
      <p>Review AI-suggested categorizations (Read-Only)</p>

      {suggestions.length === 0 ? (
        <p>No suggestions available</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Transaction</th>
                <th>Suggested Category</th>
                <th>Confidence</th>
                <th>Reasoning</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((suggestion) => {
                const txn = getTransaction(suggestion.transaction_id);
                const category = getCategory(suggestion.suggested_category_id);
                const isSelected = selectedIds.has(suggestion.transaction_id);

                return (
                  <tr key={suggestion.transaction_id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelection(suggestion.transaction_id)}
                      />
                    </td>
                    <td>{txn?.description || 'Unknown'}</td>
                    <td>{category?.name || 'Unknown'}</td>
                    <td>{Math.round(suggestion.confidence * 100)}%</td>
                    <td>{suggestion.reasoning}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="actions">
            <button
              disabled={true}
              title="AI suggestions are read-only. Apply changes manually."
            >
              Approve Disabled (Read-Only)
            </button>
          </div>
        </>
      )}
    </div>
  );
};
