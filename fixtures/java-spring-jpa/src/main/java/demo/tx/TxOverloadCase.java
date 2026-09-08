package demo.tx;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** oracle: tx-overload — UNKNOWN. Same name, same arity, different parameter types. */
@Service
public class TxOverloadCase {

    public void submit(Object payload) {
        save(payload);
    }

    @Transactional
    public void save(OrderRef payload) {
    }

    public void save(String payload) {
    }
}

class OrderRef {
}
