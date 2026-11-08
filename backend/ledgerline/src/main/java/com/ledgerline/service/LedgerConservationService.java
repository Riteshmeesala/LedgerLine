package com.ledgerline.service;

import com.ledgerline.dto.AccountReconciliationDto;
import com.ledgerline.dto.LedgerConservationDto;
import com.ledgerline.dto.PageResponse;
import com.ledgerline.dto.ReconciliationReportDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class LedgerConservationService {

    private final JdbcTemplate jdbcTemplate;

    public LedgerConservationService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Checks zero-sum conservation of the ledger across all entries, account balances, and individual transfers.
     */
    @Transactional(readOnly = true)
    public LedgerConservationDto checkConservation() {
        long sumOfEntries = Optional.ofNullable(
                jdbcTemplate.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM ledger_entries", Long.class)
        ).orElse(0L);

        long sumOfBalances = Optional.ofNullable(
                jdbcTemplate.queryForObject("SELECT COALESCE(SUM(balance), 0) FROM accounts", Long.class)
        ).orElse(0L);

        long imbalancedTransferCount = Optional.ofNullable(
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM (" +
                                "  SELECT transfer_id FROM ledger_entries GROUP BY transfer_id HAVING SUM(amount) <> 0" +
                                ") sub",
                        Long.class
                )
        ).orElse(0L);

        boolean healthy = (sumOfEntries == 0L && sumOfBalances == 0L && imbalancedTransferCount == 0L);

        return new LedgerConservationDto(sumOfEntries, sumOfBalances, imbalancedTransferCount, healthy);
    }

    /**
     * Generates a paginated account-by-account reconciliation report comparing
     * each account's stored balance against the sum of its ledger entries.
     */
    @Transactional(readOnly = true)
    public ReconciliationReportDto getReconciliationReport(int page, int size) {
        int boundedPage = Math.max(0, page);
        int boundedSize = Math.clamp(size, 1, 100);
        int offset = boundedPage * boundedSize;

        long totalElements = Optional.ofNullable(
                jdbcTemplate.queryForObject("SELECT COUNT(*) FROM accounts", Long.class)
        ).orElse(0L);

        int totalPages = (int) Math.ceil((double) totalElements / boundedSize);

        List<AccountReconciliationDto> content = jdbcTemplate.query(
                "SELECT a.id, a.name, a.type, a.owner_id, a.status, a.balance AS stored_balance, " +
                        "       COALESCE(SUM(le.amount), 0) AS entries_sum " +
                        "FROM accounts a " +
                        "LEFT JOIN ledger_entries le ON a.id = le.account_id " +
                        "GROUP BY a.id, a.name, a.type, a.owner_id, a.status, a.balance " +
                        "ORDER BY a.type DESC, a.name ASC " +
                        "LIMIT ? OFFSET ?",
                (rs, rowNum) -> {
                    UUID accountId = rs.getObject("id", UUID.class);
                    String accountName = rs.getString("name");
                    String accountType = rs.getString("type");
                    UUID ownerId = rs.getObject("owner_id", UUID.class);
                    String status = rs.getString("status");
                    long storedBalance = rs.getLong("stored_balance");
                    long entriesSum = rs.getLong("entries_sum");
                    long difference = storedBalance - entriesSum;
                    boolean reconciled = (difference == 0L);
                    boolean isSystemAccount = "SYSTEM".equalsIgnoreCase(accountType);

                    return new AccountReconciliationDto(
                            accountId,
                            accountName,
                            accountType,
                            ownerId,
                            status,
                            storedBalance,
                            entriesSum,
                            difference,
                            reconciled,
                            isSystemAccount
                    );
                },
                boundedSize,
                offset
        );

        // Global count of all accounts with discrepancies in the system
        long totalDiscrepancies = Optional.ofNullable(
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM (" +
                                "  SELECT a.id " +
                                "  FROM accounts a " +
                                "  LEFT JOIN ledger_entries le ON a.id = le.account_id " +
                                "  GROUP BY a.id, a.balance " +
                                "  HAVING a.balance <> COALESCE(SUM(le.amount), 0)" +
                                ") sub",
                        Long.class
                )
        ).orElse(0L);

        boolean overallHealthy = (totalDiscrepancies == 0L);
        PageResponse<AccountReconciliationDto> pageResponse = new PageResponse<>(
                content, boundedPage, boundedSize, totalElements, totalPages
        );

        return new ReconciliationReportDto(pageResponse, overallHealthy, totalDiscrepancies, Instant.now());
    }
}

