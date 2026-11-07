package com.ledgerline.dto;

import java.time.Instant;
import java.util.UUID;

public class TransferResponse {

    private UUID transferId;
    private String kind;
    private UUID fromAccountId;
    private UUID toAccountId;
    private Long amountMinor;
    private String currency = "INR";
    private Instant createdAt;
    private boolean replayed;

    public TransferResponse() {}

    public TransferResponse(UUID transferId, String kind, UUID fromAccountId, UUID toAccountId, Long amountMinor, Instant createdAt, boolean replayed) {
        this.transferId = transferId;
        this.kind = kind;
        this.fromAccountId = fromAccountId;
        this.toAccountId = toAccountId;
        this.amountMinor = amountMinor;
        this.currency = "INR";
        this.createdAt = createdAt;
        this.replayed = replayed;
    }

    public UUID getTransferId() {
        return transferId;
    }

    public String getKind() {
        return kind;
    }

    public UUID getFromAccountId() {
        return fromAccountId;
    }

    public UUID getToAccountId() {
        return toAccountId;
    }

    public Long getAmountMinor() {
        return amountMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isReplayed() {
        return replayed;
    }

    public void setReplayed(boolean replayed) {
        this.replayed = replayed;
    }
}

