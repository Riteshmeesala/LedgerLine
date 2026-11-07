package com.ledgerline.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public class TransferRequest {

    @NotNull(message = "fromAccountId is required")
    private UUID fromAccountId;

    @NotNull(message = "toAccountId is required")
    private UUID toAccountId;

    @NotNull(message = "amountMinor is required")
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Long amountMinor;

    public TransferRequest() {}

    public TransferRequest(UUID fromAccountId, UUID toAccountId, Long amountMinor) {
        this.fromAccountId = fromAccountId;
        this.toAccountId = toAccountId;
        this.amountMinor = amountMinor;
    }

    public UUID getFromAccountId() {
        return fromAccountId;
    }

    public void setFromAccountId(UUID fromAccountId) {
        this.fromAccountId = fromAccountId;
    }

    public UUID getToAccountId() {
        return toAccountId;
    }

    public void setToAccountId(UUID toAccountId) {
        this.toAccountId = toAccountId;
    }

    public Long getAmountMinor() {
        return amountMinor;
    }

    public void setAmountMinor(Long amountMinor) {
        this.amountMinor = amountMinor;
    }
}

