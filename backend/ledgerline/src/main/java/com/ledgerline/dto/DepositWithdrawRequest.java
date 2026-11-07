package com.ledgerline.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotNull;

public class DepositWithdrawRequest {

    @NotNull(message = "amountMinor is required")
    @JsonDeserialize(using = StrictIntegerDeserializer.class)
    private Long amountMinor;

    public DepositWithdrawRequest() {}

    public DepositWithdrawRequest(Long amountMinor) {
        this.amountMinor = amountMinor;
    }

    public Long getAmountMinor() {
        return amountMinor;
    }

    public void setAmountMinor(Long amountMinor) {
        this.amountMinor = amountMinor;
    }
}

