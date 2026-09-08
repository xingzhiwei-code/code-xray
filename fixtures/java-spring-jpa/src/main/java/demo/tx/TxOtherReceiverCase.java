package demo.tx;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** oracle: tx-other-receiver — NEGATIVE. @Transactional target reached via another object. */
@Service
public class TxOtherReceiverCase {

    private final TxOtherReceiverHelper helper = new TxOtherReceiverHelper();

    public void submit(String payload) {
        helper.save(payload);
    }
}

class TxOtherReceiverHelper {

    @Transactional
    public void save(String payload) {
    }
}
