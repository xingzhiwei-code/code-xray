package demo.txb;

import org.springframework.stereotype.Service;

/** oracle: txb-string-comment — NEGATIVE. @Transactional only in a comment, no real annotation. */
@Service
public class TxbStringCommentCase {

    // "@Transactional" appears only as a comment
    public void run() {
    }
}
