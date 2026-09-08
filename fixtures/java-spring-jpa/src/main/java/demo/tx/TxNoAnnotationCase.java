package demo.tx;

import org.springframework.stereotype.Service;

/** oracle: tx-no-annotation — NEGATIVE. Self call, but target lacks @Transactional. */
@Service
public class TxNoAnnotationCase {

    public void submit(String payload) {
        save(payload);
    }

    public void save(String payload) {
    }
}
