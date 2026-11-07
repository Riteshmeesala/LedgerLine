package com.ledgerline.service;

import com.ledgerline.dto.LedgerConservationDto;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

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
}

