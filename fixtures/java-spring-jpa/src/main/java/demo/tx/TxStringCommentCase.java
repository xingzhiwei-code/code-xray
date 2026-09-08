package demo.tx;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** oracle: tx-string-comment — NEGATIVE. Call-like text in comments/strings must not trigger. */
@Service
public class TxStringCommentCase {

    public void submit(String payload) {
        // save(payload); commented out on purpose
        System.out.println("save(payload)");
    }

    @Transactional
    public void save(String payload) {
    }
}
